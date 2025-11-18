"""Простейшая защита от слишком частых сообщений."""
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Dict

from telegram import Update
from telegram.ext import Application, CallbackContext, MessageHandler, filters

from config import FLOOD_COOLDOWN_SECONDS, FLOOD_WARNING

if TYPE_CHECKING:
    from database.manager import DatabaseManager

# В памяти храним время последнего сообщения пользователя в конкретном чате
_last_messages: Dict[int, Dict[int, float]] = {}


async def check_flood(update: Update, context: CallbackContext) -> None:
    message = update.message
    if not message:
        return
    chat_id = message.chat_id
    user_id = message.from_user.id if message.from_user else 0

    chat_messages = _last_messages.setdefault(chat_id, {})
    now = time.time()
    last_time = chat_messages.get(user_id, 0)

    if now - last_time < FLOOD_COOLDOWN_SECONDS:
        await message.delete()
        await message.reply_text(FLOOD_WARNING)
        return

    chat_messages[user_id] = now


def add_handlers(application: Application, db: "DatabaseManager") -> None:
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, check_flood),
        group=1,
    )
