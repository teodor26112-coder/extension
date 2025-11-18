"""Инструменты для работы с базой данных бота."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Tuple


class DatabaseManager:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _execute(self, query: str, params: Tuple = ()) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(query, params)
            conn.commit()

    def _fetchall(self, query: str, params: Tuple = ()) -> List[Tuple]:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(query, params)
            return cursor.fetchall()

    def ensure_schema(self) -> None:
        self._execute(
            """
            CREATE TABLE IF NOT EXISTS chats (
                chat_id INTEGER PRIMARY KEY,
                chat_name TEXT,
                subscriber_count INTEGER DEFAULT 0,
                messages_count INTEGER DEFAULT 0
            )
            """
        )
        self._execute(
            """
            CREATE TABLE IF NOT EXISTS chat_settings (
                chat_id INTEGER,
                module TEXT,
                setting_key TEXT,
                setting_value TEXT,
                PRIMARY KEY (chat_id, module, setting_key)
            )
            """
        )
        self._execute(
            """
            CREATE TABLE IF NOT EXISTS subscriptions (
                user_id INTEGER PRIMARY KEY,
                subscription_start_date TEXT,
                subscription_end_date TEXT,
                paid_modules TEXT
            )
            """
        )
        self._execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                last_seen TEXT
            )
            """
        )
        self._execute(
            """
            CREATE TABLE IF NOT EXISTS mute_votes (
                chat_id INTEGER,
                target_user_id INTEGER,
                votes INTEGER DEFAULT 0,
                expires_at TEXT,
                PRIMARY KEY (chat_id, target_user_id)
            )
            """
        )

    def register_chat(self, chat_id: int, chat_name: str) -> None:
        self._execute(
            """
            INSERT INTO chats (chat_id, chat_name, subscriber_count, messages_count)
            VALUES (?, ?, 0, 0)
            ON CONFLICT(chat_id) DO UPDATE SET chat_name = excluded.chat_name
            """,
            (chat_id, chat_name),
        )

    def record_message(self, chat_id: int, user_id: int, username: str | None = None) -> None:
        now = datetime.utcnow().isoformat()
        self._execute(
            """
            UPDATE chats SET messages_count = messages_count + 1 WHERE chat_id = ?
            """,
            (chat_id,),
        )
        self._execute(
            """
            INSERT INTO users (user_id, username, xp, level, last_seen)
            VALUES (?, ?, 0, 1, ?)
            ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, last_seen = excluded.last_seen
            """,
            (user_id, username, now),
        )

    def add_xp(
        self, user_id: int, username: str | None, amount: int, xp_per_level: int
    ) -> Tuple[int, int, int]:
        self._execute(
            """
            INSERT INTO users (user_id, username, xp, level, last_seen)
            VALUES (?, ?, 0, 1, ?)
            ON CONFLICT(user_id) DO UPDATE SET username = excluded.username
            """,
            (user_id, username, datetime.utcnow().isoformat()),
        )
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT xp, level FROM users WHERE user_id = ?", (user_id,))
            xp_before, level_before = cursor.fetchone()
            xp_total = xp_before + amount
            new_level = max(level_before, xp_total // xp_per_level + 1)
            conn.execute(
                "UPDATE users SET xp = ?, level = ? WHERE user_id = ?",
                (xp_total, new_level, user_id),
            )
            conn.commit()
        return xp_total, new_level, level_before

    def save_subscription(self, user_id: int, paid_modules: Dict[str, bool]) -> None:
        now = datetime.utcnow().isoformat()
        end_date = (datetime.utcnow() + timedelta(days=30)).isoformat()
        module_list = ",".join([k for k, v in paid_modules.items() if v])
        self._execute(
            """
            INSERT INTO subscriptions (user_id, subscription_start_date, subscription_end_date, paid_modules)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                subscription_start_date = excluded.subscription_start_date,
                subscription_end_date = excluded.subscription_end_date,
                paid_modules = excluded.paid_modules
            """,
            (user_id, now, end_date, module_list),
        )

    def add_vote(self, chat_id: int, target_user_id: int, expires_at: datetime) -> int:
        self._execute(
            """
            INSERT INTO mute_votes (chat_id, target_user_id, votes, expires_at)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(chat_id, target_user_id) DO UPDATE SET
                votes = mute_votes.votes + 1,
                expires_at = excluded.expires_at
            """,
            (chat_id, target_user_id, expires_at.isoformat()),
        )
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT votes FROM mute_votes WHERE chat_id = ? AND target_user_id = ?",
                (chat_id, target_user_id),
            )
            (votes,) = cursor.fetchone()
        return votes

    def reset_votes(self, chat_id: int, target_user_id: int) -> None:
        self._execute("DELETE FROM mute_votes WHERE chat_id = ? AND target_user_id = ?", (chat_id, target_user_id))

    def set_chat_setting(self, chat_id: int, module: str, key: str, value: str) -> None:
        self._execute(
            """
            INSERT INTO chat_settings (chat_id, module, setting_key, setting_value)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(chat_id, module, setting_key)
            DO UPDATE SET setting_value = excluded.setting_value
            """,
            (chat_id, module, key, value),
        )

    def get_chat_setting(self, chat_id: int, module: str, key: str, default: str | None = None) -> str | None:
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT setting_value FROM chat_settings WHERE chat_id = ? AND module = ? AND setting_key = ?",
                (chat_id, module, key),
            )
            row = cursor.fetchone()
        if row is None:
            return default
        return row[0]

    def get_module_settings(self, chat_id: int, module: str) -> Dict[str, str]:
        settings: Dict[str, str] = {}
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT setting_key, setting_value FROM chat_settings WHERE chat_id = ? AND module = ?",
                (chat_id, module),
            )
            for key, value in cursor.fetchall():
                settings[key] = value
        return settings

    def get_stats(self) -> Dict[str, int]:
        chats = self._fetchall("SELECT COUNT(*), COALESCE(SUM(messages_count), 0) FROM chats")
        users = self._fetchall("SELECT COUNT(*) FROM users")
        subscriptions = self._fetchall("SELECT COUNT(*) FROM subscriptions")
        return {
            "chats": chats[0][0] if chats else 0,
            "messages": chats[0][1] if chats else 0,
            "users": users[0][0] if users else 0,
            "subscriptions": subscriptions[0][0] if subscriptions else 0,
        }

    def list_chats(self) -> List[Tuple[int, str, int, int]]:
        return self._fetchall("SELECT chat_id, chat_name, subscriber_count, messages_count FROM chats")

    def list_users(self) -> List[Tuple[int, str, int, int]]:
        return self._fetchall("SELECT user_id, username, xp, level FROM users ORDER BY xp DESC LIMIT 20")
