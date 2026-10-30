#!/usr/bin/env python3
"""Jedno wspólne losowanie 10 różnych numerków na tydzień szkolny."""
from __future__ import annotations

import json
import secrets
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CONFIG_FILE = ROOT / "config.json"
RESULTS_FILE = ROOT / "data" / "results.json"
WARSAW = ZoneInfo("Europe/Warsaw")
DAYS = ("poniedziałek", "wtorek", "środa", "czwartek", "piątek")


def target_monday(now: datetime) -> date:
    """Od piątku 18:00 obowiązuje zestaw na następny tydzień."""
    local = now.astimezone(WARSAW)
    monday = local.date() - timedelta(days=local.weekday())
    if local.weekday() >= 5 or (local.weekday() == 4 and local.hour >= 18):
        monday += timedelta(days=7)
    return monday


def create_results(monday: date, minimum: int, maximum: int, now: datetime) -> dict:
    if any(isinstance(n, bool) or not isinstance(n, int) for n in (minimum, maximum)):
        raise ValueError("minNumber i maxNumber muszą być liczbami całkowitymi")
    if maximum - minimum + 1 < 10:
        raise ValueError("Zakres musi zawierać przynajmniej 10 różnych numerków")

    numbers = secrets.SystemRandom().sample(range(minimum, maximum + 1), 10)
    return {
        "weekStart": monday.isoformat(),
        "weekEnd": (monday + timedelta(days=4)).isoformat(),
        "drawnAt": now.astimezone(WARSAW).isoformat(timespec="seconds"),
        "minNumber": minimum,
        "maxNumber": maximum,
        "days": [
            {
                "date": (monday + timedelta(days=i)).isoformat(),
                "day": DAYS[i],
                "numbers": [numbers[2 * i], numbers[2 * i + 1]],
            }
            for i in range(5)
        ],
    }


def is_valid_for_week(data: dict, monday: date) -> bool:
    if not isinstance(data, dict) or data.get("weekStart") != monday.isoformat():
        return False
    if data.get("weekEnd") != (monday + timedelta(days=4)).isoformat():
        return False
    days = data.get("days")
    if not isinstance(days, list) or len(days) != 5:
        return False
    nums = []
    for i, day in enumerate(days):
        if not isinstance(day, dict) or day.get("date") != (monday + timedelta(days=i)).isoformat():
            return False
        pair = day.get("numbers")
        if not isinstance(pair, list) or len(pair) != 2:
            return False
        nums.extend(pair)
    try:
        return all(type(n) is int and data["minNumber"] <= n <= data["maxNumber"] for n in nums) and len(set(nums)) == 10
    except (KeyError, TypeError):
        return False


def update_results(now: datetime | None = None) -> bool:
    now = now or datetime.now(WARSAW)
    config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    monday = target_monday(now)

    if RESULTS_FILE.exists():
        try:
            previous = json.loads(RESULTS_FILE.read_text(encoding="utf-8"))
            if is_valid_for_week(previous, monday):
                print(f"Wyniki na {monday} już istnieją — pozostają bez zmian.")
                return False
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            pass

    data = create_results(monday, config["minNumber"], config["maxNumber"], now)
    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Wylosowano 10 unikalnych numerków na {data['weekStart']}–{data['weekEnd']}.")
    return True


if __name__ == "__main__":
    update_results()
