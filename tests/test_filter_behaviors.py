import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import Mock, patch

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

    def test_section_with_null_lists_keeps_valid_section_metadata(self):
        result = self.fetcher.format_section({
            "number": "01",
            "openStatusText": "Open",
            "instructors": None,
            "meetingTimes": None,
        })

        self.assertEqual(result["number"], "01")
        self.assertEqual(result["status"], "Open")
        self.assertEqual(result["instructors"], [])
        self.assertEqual(result["meeting_times"], [])

    def test_full_course_code_search_does_not_return_fuzzy_lookalikes(self):
        courses = [
            {"courseString": "01:198:111", "subject": "198", "courseNumber": "111", "sections": []},
            {"courseString": "01:198:110", "subject": "198", "courseNumber": "110", "sections": []},
            {"courseString": "02:198:111", "subject": "198", "courseNumber": "111", "sections": []},
        ]

        result = self.fetcher.fuzzy_search_courses(courses, "01:198:111")

        self.assertEqual([course["courseString"] for course in result], ["01:198:111"])

    def test_multiword_subject_and_number_search_is_specific(self):
        courses = [
            {
                "courseString": "01:198:111",
                "subject": "198",
                "courseNumber": "111",
                "subjectDescription": "Computer Science",
                "sections": [],
            },
            {
                "courseString": "01:198:112",
                "subject": "198",
                "courseNumber": "112",
                "subjectDescription": "Computer Science",
                "sections": [],
            },
            {
                "courseString": "01:640:111",
                "subject": "640",
                "courseNumber": "111",
                "subjectDescription": "Mathematics",
                "sections": [],
            },
        ]

        for query in ("computer science 111", "intro to computer science 111"):
            with self.subTest(query=query):
                result = self.fetcher.fuzzy_search_courses(courses, query)
                self.assertEqual([course["courseString"] for course in result], ["01:198:111"])

        result = self.fetcher.fuzzy_search_courses(courses, "data structures 112")
        self.assertEqual([course["courseString"] for course in result], ["01:198:112"])

    def test_instructor_search_accepts_string_names_from_upstream(self):
        courses = [{
            "courseString": "01:198:111",
            "subject": "198",
            "courseNumber": "111",
            "sections": [{"instructors": ["DOE, JANE"]}],
        }]

        result = self.fetcher.fuzzy_search_courses(courses, "Jane Doe")

        self.assertEqual([course["courseString"] for course in result], ["01:198:111"])

    def test_empty_initial_response_is_backed_off_until_cache_ttl_expires(self):
        response = Mock()
        response.json.return_value = []
        with patch.object(self.fetcher.session, "get", return_value=response) as get:
            self.assertEqual(self.fetcher.get_courses(), [])
            self.assertEqual(self.fetcher.get_courses(), [])

        get.assert_called_once()

    def test_failed_initial_fetch_is_backed_off_until_cache_ttl_expires(self):
        with patch.object(
            self.fetcher.session, "get", side_effect=RuntimeError("upstream unavailable")
        ) as get:
            with self.assertLogs("course_fetcher", level="ERROR"):
                self.assertEqual(self.fetcher.get_courses(), [])
                self.assertEqual(self.fetcher.get_courses(), [])

        get.assert_called_once()

    def test_empty_refresh_preserves_stale_data_and_backs_off(self):
        key = "2026_1_NB"
        self.fetcher.courses_by_params[key] = [{"courseString": "01:198:111"}]
        self.fetcher.updated_at_by_params[key] = datetime.now(timezone.utc) - timedelta(hours=1)
        response = Mock()
        response.json.return_value = []

        with patch.object(self.fetcher.session, "get", return_value=response) as get:
            result = self.fetcher.get_courses()
            self.assertEqual(self.fetcher.get_courses(), result)

        get.assert_called_once()
        self.assertEqual([course["courseString"] for course in result], ["01:198:111"])
        self.assertGreater(self.fetcher.updated_at_by_params[key], datetime.now(timezone.utc) - timedelta(seconds=5))


class AppRenderingTests(unittest.TestCase):
    def test_vercel_analytics_loads_only_on_vercel(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("VERCEL", None)
            response = app_module.app.test_client().get("/docs")
            self.assertNotIn(b"cdn.vercel-insights.com", response.data)

        with patch.dict(os.environ, {"VERCEL": "1"}):
            response = app_module.app.test_client().get("/docs")
            self.assertIn(b"cdn.vercel-insights.com", response.data)

    def test_favicon_is_served_from_the_bundled_image(self):
        with app_module.app.test_client() as client:
            response = client.get("/favicon.ico")
            try:
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.mimetype, "image/png")
                self.assertTrue(response.data.startswith(b"\x89PNG\r\n\x1a\n"))
            finally:
                response.close()


class RoomFilterTests(unittest.TestCase):
    def test_room_extraction_skips_missing_and_placeholder_locations(self):
        class FakeCourseFetcher:
            def get_courses(self, **_kwargs):
                return []

        fetcher = RoomFetcher(FakeCourseFetcher())
        rooms = fetcher._extract_rooms_from_courses([{
            "sections": [{
                "meeting_times": [
                    {"building": "N/A", "room": "N/A"},
                    {"building": " ", "room": "103"},
                    {"building": "ARC", "room": "103"},
                ]
            }]
        }])

        self.assertEqual([(room["building"], room["room"]) for room in rooms], [("ARC", "103")])

    def test_room_code_and_number_search_does_not_leak_fuzzy_matches(self):
        courses = [{
            "courseString": "TEST 200",
            "sections": [{"meeting_times": [{
                "building": "ARC", "room": "103", "building_name": "Academic Resource Center",
                "campus": "College Ave", "campus_name": "College Ave",
            }, {
                "building": "ARC", "room": "105", "building_name": "Academic Resource Center",
                "campus": "College Ave", "campus_name": "College Ave",
            }]}],
        }]

        class FakeCourseFetcher:
            def get_courses(self, **_kwargs):
                return courses

        fetcher = RoomFetcher(FakeCourseFetcher())
        self.assertEqual([], fetcher.search_rooms("ARC 999"))
        self.assertEqual(["103"], [room["room"] for room in fetcher.search_rooms("ARC 103")])
        self.assertEqual(
            [],
            fetcher.search_rooms("Academic Resource Center 103", campus_filters=["Busch"]),
        )

    def test_room_details_without_a_room_shows_the_validation_message(self):
        response = app_module.app.test_client().get(
            "/room-details?year=2026&term=1&campus=NB"
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Building and room must be specified", response.data)

    def test_availability_search_preserves_campus_filter(self):
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
            campus_filters=["Busch"],
        )

        self.assertEqual([(room["building"], room["room"]) for room in available], [("HILL", "114")])
        self.assertEqual("unknown", available[0]["building_type"])

    def test_unknown_day_meeting_is_not_reported_as_available(self):
        courses = [{
            "courseString": "TEST 300",
            "title": "Roomed class with missing day",
            "sections": [{
                "number": "01",
                "meeting_times": [{
                    "building": "BL", "room": "148", "day": "",
                    "start_time": {"formatted": "N/A"},
                    "end_time": {"formatted": "N/A"},
                }],
            }],
        }]

        class FakeCourseFetcher:
            def get_courses(self, **_kwargs):
                return courses

        fetcher = RoomFetcher(FakeCourseFetcher())
        available = fetcher.find_available_rooms(
            day="Monday", start_time="9:00 AM", end_time="10:00 AM"
        )
        schedule = fetcher.get_room_schedule("BL", "148")

        self.assertEqual([], available)
        self.assertTrue(schedule["has_incomplete_schedule"])
        self.assertEqual("Schedule Incomplete", schedule["daily_schedule"]["Monday"]["status"])
        self.assertEqual(1, len(schedule["unscheduled_classes"]))
        self.assertEqual("TEST 300", schedule["unscheduled_classes"][0]["course_code"])

    def test_known_day_with_missing_time_is_not_reported_as_available(self):
        courses = [{
            "courseString": "TEST 301",
            "sections": [{
                "number": "01",
                "meeting_times": [{
                    "building": "ARC", "room": "103", "day": "Tuesday",
                    "start_time": {"formatted": "N/A"},
                    "end_time": {"formatted": "N/A"},
                }],
            }],
        }]

        class FakeCourseFetcher:
            def get_courses(self, **_kwargs):
                return courses

        fetcher = RoomFetcher(FakeCourseFetcher())
        self.assertEqual([], fetcher.find_available_rooms(
            day="Tuesday", start_time="9:00 AM", end_time="10:00 AM"
        ))
        self.assertEqual([("ARC", "103")], [
            (room["building"], room["room"])
            for room in fetcher.find_available_rooms(
                day="Monday", start_time="9:00 AM", end_time="10:00 AM"
            )
        ])
        schedule = fetcher.get_room_schedule("ARC", "103")
        self.assertEqual("Schedule Incomplete", schedule["daily_schedule"]["Tuesday"]["status"])
        self.assertEqual("Available All Day", schedule["daily_schedule"]["Monday"]["status"])

    def test_nonexistent_room_schedule_is_not_returned_as_available(self):
        class FakeCourseFetcher:
            def get_courses(self, **_kwargs):
                return []

        self.assertIsNone(RoomFetcher(FakeCourseFetcher()).get_room_schedule("ARC", "999"))

    def test_room_api_reports_boolean_filter_flags_and_forwards_filters(self):
        client = app_module.app.test_client()
        with patch.object(app_module.room_fetcher, "search_rooms", return_value=[]) as search_rooms:
            response = client.get(
                "/api/rooms?year=2026&term=1&campus=NB&filter_campuses=true&campus_busch=true"
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertIs(payload["filter_applied"], False)
        self.assertIs(payload["building_types_filtered"], False)
        self.assertIs(payload["campus_filtered"], True)
        search_rooms.assert_called_once()
        self.assertNotIn("building_types", search_rooms.call_args.kwargs)
        self.assertEqual(search_rooms.call_args.kwargs["campus_filters"], ["Busch"])

    def test_room_api_rejects_unsupported_legacy_building_type_filters(self):
        client = app_module.app.test_client()
        with patch.object(app_module.room_fetcher, "search_rooms") as search_rooms:
            response = client.get(
                "/api/rooms?year=2026&term=1&campus=NB&type_lecture=true&campus_busch=true"
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Room type filters are unavailable", response.get_json()["message"])
        search_rooms.assert_not_called()

    def test_room_schedule_api_returns_404_for_unknown_room(self):
        with patch.object(app_module.room_fetcher, "get_room_schedule", return_value=None):
            response = app_module.app.test_client().get(
                "/api/room-schedule?year=2026&term=1&campus=NB&building=ARC&room=999"
            )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.get_json()["status"], "error")

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
                "/api/rooms?year=2026&term=1&campus=NB&filter_campuses=true"
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["data"], [])
        search_rooms.assert_not_called()


if __name__ == "__main__":
    unittest.main()
