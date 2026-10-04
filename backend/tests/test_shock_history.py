import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Tests must never select a configured production database.
with patch.dict(os.environ, {}, clear=True):
    import api
    import database
    from channels import CHANNELS
    from simulator import _build_shock_multipliers, run_full_simulation


class ShockHistoryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        db_path = patch.object(database, "DB_PATH", str(Path(temporary.name) / "bandit.db"))
        db_path.start()
        self.addCleanup(db_path.stop)
        backend = patch.object(database, "USE_POSTGRES", False)
        backend.start()
        self.addCleanup(backend.stop)
        database.setup_database(CHANNELS)

    def trigger(self):
        with patch.object(api.random, "choice", return_value=api.SHOCK_EVENTS[0]), \
             patch.object(api.random, "randint", return_value=3):
            return api.shock()

    def test_trigger_after_day_one_applies_to_days_two_through_four(self):
        run_full_simulation(1)
        response = self.trigger()
        self.assertEqual((response["start_day"], response["end_day"]), (2, 4))
        self.assertEqual(response["triggered_on_day"], 1)
        self.assertEqual(response["duration_days"], 3)
        active = api.active_shocks()
        self.assertEqual(len(active), 1)
        self.assertEqual((active[0]["start_day"], active[0]["end_day"]), (2, 4))
        self.assertEqual(active[0]["days_remaining"], 3)
        self.assertEqual(active[0]["affected_channel_names"], response["affected_channels"])

    def test_shock_applies_on_first_and_last_day_but_not_after(self):
        run_full_simulation(1)
        response = self.trigger()
        shocks = database.get_shocks()
        expected = {
            channel_id: response["multipliers"]
            for channel_id in api.SHOCK_EVENTS[0]["affected_channel_ids"]
        }
        self.assertEqual(_build_shock_multipliers(shocks, day_offset=0), expected)
        self.assertEqual(_build_shock_multipliers(shocks, day_offset=2), expected)
        self.assertEqual(_build_shock_multipliers(shocks, day_offset=3), {})

    def test_expired_event_keeps_dates_after_further_aging(self):
        run_full_simulation(1)
        self.trigger()
        run_full_simulation(3)
        restored = api.state()
        self.assertEqual(restored["current_day"], 4)
        self.assertEqual(restored["active_shocks"], [])
        self.assertEqual(api.active_shocks(), [])
        history = restored["shock_events"]
        self.assertEqual(len(history), 1)
        self.assertEqual((history[0]["start_day"], history[0]["end_day"]), (2, 4))
        self.assertEqual(history[0]["days_remaining"], 0)
        run_full_simulation(2)
        restored_later = api.state()["shock_events"][0]
        self.assertEqual(restored_later["days_remaining"], -2)
        self.assertEqual((restored_later["start_day"], restored_later["end_day"]), (2, 4))

    def test_trigger_before_day_one_starts_on_day_one(self):
        response = self.trigger()
        self.assertEqual((response["start_day"], response["end_day"]), (1, 3))
        run_full_simulation(1)
        restored = api.state()
        self.assertEqual(restored["active_shocks"], restored["shock_events"])
        self.assertEqual(restored["shock_events"][0]["end_day"], 3)

    def test_repository_filters_history_and_orders_by_id(self):
        first = database.insert_shock("first", "expired", [1], {"ctr": 0.5}, 1, 0)
        database.decrement_shock_durations_by(1)
        second = database.insert_shock("second", "active", [2], {"roas": 0.5}, 3, 1)
        self.assertEqual([shock["id"] for shock in database.get_shocks()], [second])
        self.assertEqual([shock["id"] for shock in database.get_shocks(active_only=False)], [first, second])
        self.assertEqual(database.get_shocks()[0]["multipliers"], {"roas": 0.5})
        self.assertEqual(database.get_shocks()[0]["affected_channel_ids"], [2])
        self.assertEqual(database.get_triggered_shock_names(), {"first", "second"})

    def test_restored_event_uses_catalog_copy_without_changing_snapshot(self):
        event = api.SHOCK_EVENTS[0]
        database.insert_shock(event["name"], "Stored old copy", event["affected_channel_ids"], event["multipliers"], 3, 0)
        restored = api.state()["shock_events"][0]
        self.assertEqual(restored["description"], event["description"])
        self.assertEqual(restored["affected_channel_ids"], event["affected_channel_ids"])
        self.assertEqual(restored["multipliers"], event["multipliers"])
        self.assertEqual((restored["start_day"], restored["end_day"]), (1, 3))
        self.assertEqual(database.get_shocks(active_only=False)[0]["description"], "Stored old copy")

    def test_same_name_with_different_parameters_keeps_stored_copy(self):
        event = api.SHOCK_EVENTS[0]
        database.insert_shock(event["name"], "Stored variant copy", [6], {"roas": 0.8}, 3, 0)
        self.assertEqual(api.state()["shock_events"][0]["description"], "Stored variant copy")

    def test_unknown_event_keeps_stored_copy(self):
        database.insert_shock("Unknown event", "Stored custom copy", [1], {"ctr": 0.5}, 2, 0)
        self.assertEqual(api.state()["shock_events"][0]["description"], "Stored custom copy")

    def test_endpoint_shapes_preserve_existing_fields(self):
        snapshot = api.state()
        self.assertEqual(set(snapshot), {"results", "bandit_states", "active_shocks", "shock_events", "current_day"})
        self.assertEqual(snapshot["results"], [])
        self.assertEqual(snapshot["active_shocks"], [])
        self.assertEqual(snapshot["shock_events"], [])
        self.assertEqual(snapshot["current_day"], 0)
        self.assertEqual(len(snapshot["bandit_states"]), 18)
        response = self.trigger()
        self.assertEqual(set(response), {
            "id", "name", "description", "affected_channels", "multipliers",
            "duration_days", "triggered_on_day", "start_day", "end_day",
        })
        with patch.object(api, "get_shocks", wraps=database.get_shocks) as read_shocks:
            api.state()
        read_shocks.assert_called_once_with(active_only=False)


if __name__ == "__main__":
    unittest.main()
