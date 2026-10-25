import unittest
from unittest.mock import patch

import app as app_module
from course_fetcher import CourseFetcher
from room_fetcher import RoomFetcher


def raw_meeting(day, start, campus, mode="In Person", building="ARC", room="103"):
    return {
        "meetingDay": day,
        "startTimeMilitary": start,
        "endTimeMilitary": str(int(start) + 100).zfill(4),
        "campusLocation": campus,
        "meetingModeDesc": mode,
        "buildingCode": building,
        "roomNumber": room,
    }


class CourseFilterTests(unittest.TestCase):
    def setUp(self):
        self.fetcher = CourseFetcher()

    def test_day_time_and_campus_must_match_the_same_meeting_and_section(self):
        course = {
            "courseString": "TEST 100",
            "subject": "TEST",
            "sections": [
                {
                    "number": "01",
                    "index": "10001",
                    "openStatusText": "Open",
                    "meetingTimes": [
                        raw_meeting("M", "0900", "1"),
                        raw_meeting("T", "1700", "2"),
                    ],
                },
                {
                    "number": "02",
                    "index": "10002",
                    "openStatusText": "Open",
                    "meetingTimes": [raw_meeting("M", "1700", "2")],
                },
            ],
        }

        result = self.fetcher.apply_filters([course], {
            "days": ["M"],
            "time_range": ["evening"],
            "campus": ["Busch"],
        })

        self.assertEqual(len(result), 1)
        self.assertEqual([section["index"] for section in result[0]["sections"]], ["10002"])

    def test_status_filter_returns_only_matching_sections(self):
        course = {
            "courseString": "TEST 101",
            "subject": "TEST",
            "sections": [
                {"number": "01", "index": "10101", "openStatusText": "Open", "meetingTimes": []},
                {"number": "02", "index": "10102", "openStatusText": "Closed", "meetingTimes": []},
            ],
        }

        result = self.fetcher.apply_filters([course], {"status": ["open"]})

        self.assertEqual([section["index"] for section in result[0]["sections"]], ["10101"])

    def test_weekend_filter_matches_saturday_and_sunday(self):
        course = {
            "courseString": "TEST 102",
            "subject": "TEST",
            "sections": [
                {
                    "number": "01",
                    "index": "10201",
                    "openStatusText": "Open",
                    "meetingTimes": [raw_meeting("su", "1000", "1")],
                }
            ],
        }

        result = self.fetcher.apply_filters([course], {"days": ["weekend"]})

        self.assertEqual(len(result), 1)

    def test_weekend_filter_matches_lowercase_saturday_code(self):
        course = {
            "courseString": "TEST 103",
            "subject": "TEST",
            "sections": [{
                "number": "01",
                "index": "10301",
                "openStatusText": "Open",
                "meetingTimes": [raw_meeting("s", "1000", "1")],
            }],
        }

        result = self.fetcher.apply_filters([course], {"days": ["weekend"]})

        self.assertEqual(len(result), 1)

    def test_unknown_meeting_mode_is_not_classified_as_traditional(self):
        course = {
            "courseString": "TEST 104",
            "subject": "TEST",
            "sections": [{
                "number": "01",
                "index": "10401",
                "openStatusText": "Open",
                "meetingTimes": [raw_meeting("M", "1000", "1", mode=None)],
            }],
        }

        result = self.fetcher.apply_filters([course], {"course_type": ["traditional"]})

        self.assertEqual(result, [])

    def test_invalid_military_time_does_not_match_a_time_filter(self):
        self.assertFalse(self.fetcher._is_time_in_range("1260", "afternoon"))

    def test_full_course_code_search_does_not_return_fuzzy_lookalikes(self):
        courses = [
            {"courseString": "01:198:111", "subject": "198", "courseNumber": "111", "sections": []},
            {"courseString": "01:198:110", "subject": "198", "courseNumber": "110", "sections": []},
            {"courseString": "02:198:111", "subject": "198", "courseNumber": "111", "sections": []},
        ]

        result = self.fetcher.fuzzy_search_courses(courses, "01:198:111")

        self.assertEqual([course["courseString"] for course in result], ["01:198:111"])


class RoomFilterTests(unittest.TestCase):
    def test_availability_search_preserves_type_and_campus_filters(self):
        courses = [
            {
                "courseString": "TEST 200",
                "sections": [{
                    "meeting_times": [
                        {"building": "ARC", "room": "103", "day": "Monday",
                         "start_time": {"formatted": "8:30 AM"},
                         "end_time": {"formatted": "9:30 AM"}, "campus": "College Ave"}
                    ]
                }],
            },
            {
                "courseString": "TEST 201",
                "sections": [{
                    "meeting_times": [
                        {"building": "HILL", "room": "114", "day": "Monday",
                         "start_time": {"formatted": "11:00 AM"},
                         "end_time": {"formatted": "12:00 PM"}, "campus": "Busch"}
                    ]
                }],
            },
        ]

        class FakeCourseFetcher:
            def get_courses(self, **_kwargs):
                return courses

        fetcher = RoomFetcher(FakeCourseFetcher())
        available = fetcher.find_available_rooms(
            day="Monday",
            start_time="8:00 AM",
            end_time="9:00 AM",
            building_types=["lecture"],
            campus_filters=["Busch"],
        )

        self.assertEqual([(room["building"], room["room"]) for room in available], [("HILL", "114")])

    def test_room_api_reports_boolean_filter_flags_and_forwards_filters(self):
        client = app_module.app.test_client()
        with patch.object(app_module.room_fetcher, "search_rooms", return_value=[]) as search_rooms:
            response = client.get(
                "/api/rooms?year=2026&term=1&campus=NB&filter_building_types=true&"
                "type_lecture=true&filter_campuses=true&campus_busch=true"
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIs(payload["filter_applied"], False)
        self.assertIs(payload["building_types_filtered"], True)
        self.assertIs(payload["campus_filtered"], True)
        search_rooms.assert_called_once()
        self.assertEqual(search_rooms.call_args.kwargs["building_types"], ["lecture"])
        self.assertEqual(search_rooms.call_args.kwargs["campus_filters"], ["Busch"])

    def test_room_api_preserves_legacy_filter_flags_without_activation_sentinels(self):
        client = app_module.app.test_client()
        with patch.object(app_module.room_fetcher, "search_rooms", return_value=[]) as search_rooms:
            response = client.get(
                "/api/rooms?year=2026&term=1&campus=NB&type_lecture=true&campus_busch=true"
            )

        self.assertEqual(response.status_code, 200)
        search_rooms.assert_called_once()
        self.assertEqual(search_rooms.call_args.kwargs["building_types"], ["lecture"])
        self.assertEqual(search_rooms.call_args.kwargs["campus_filters"], ["Busch"])

    def test_availability_api_rejects_incomplete_ranges(self):
        response = app_module.app.test_client().get(
            "/api/rooms?year=2026&term=1&campus=NB&filter_available=true"
        )
        self.assertEqual(response.status_code, 400)

    def test_availability_api_rejects_invalid_or_reversed_times(self):
        client = app_module.app.test_client()
        for start_time, end_time in (("not-a-time", "9:00 AM"), ("10:00 AM", "9:00 AM")):
            with self.subTest(start_time=start_time, end_time=end_time):
                response = client.get(
                    "/api/rooms?year=2026&term=1&campus=NB&filter_available=true&"
                    f"day=Monday&start_time={start_time.replace(' ', '+')}&"
                    f"end_time={end_time.replace(' ', '+')}"
                )
                self.assertEqual(response.status_code, 400)

    def test_active_room_filter_with_no_selections_returns_no_rooms(self):
        client = app_module.app.test_client()
        with patch.object(app_module.room_fetcher, "search_rooms") as search_rooms:
            response = client.get(
                "/api/rooms?year=2026&term=1&campus=NB&filter_building_types=true&filter_campuses=true"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"], [])
        search_rooms.assert_not_called()


if __name__ == "__main__":
    unittest.main()
