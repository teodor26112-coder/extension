"""Простейшая защита от слишком частых сообщений."""
from __future__ import annotations

import time
from typing import TYPE_CHECKING, Dict

from telegram import Update
from telegram.ext import Application, CallbackContext, CommandHandler, MessageHandler, filters

from config import FLOOD_COOLDOWN_SECONDS, FLOOD_WARNING
from modules.utils import is_chat_admin

if TYPE_CHECKING:
    from database.manager import DatabaseManager

# В памяти храним время последнего сообщения пользователя в конкретном чате
_last_messages: Dict[int, Dict[int, float]] = {}


async def check_flood(update: Update, context: CallbackContext, db: "DatabaseManager") -> None:
    message = update.message
    chat = update.effective_chat
    if not message or not chat:
        return
    settings = db.get_module_settings(chat.id, "anti_flood")
    if settings.get("enabled", "1") != "1":
        return

    chat_id = message.chat_id
    user_id = message.from_user.id if message.from_user else 0

    chat_messages = _last_messages.setdefault(chat_id, {})
    now = time.time()
    last_time = chat_messages.get(user_id, 0)
    cooldown = float(settings.get("cooldown", FLOOD_COOLDOWN_SECONDS))

    if now - last_time < cooldown:
        await message.delete()
        await message.reply_text(settings.get("warning", FLOOD_WARNING))
        return

    chat_messages[user_id] = now


async def flood_settings(update: Update, context: CallbackContext, db: "DatabaseManager") -> None:
    if not await is_chat_admin(update):
        await update.message.reply_text("Только администратор может менять настройки.")
        return

    chat = update.effective_chat
    if not chat:
        return

    updated = []
    for arg in context.args:
        if "=" not in arg:
            continue
        key, value = arg.split("=", 1)
        key = key.strip().lower()
        value = value.strip()
        if key in {"cooldown", "warning", "enabled"}:
            db.set_chat_setting(chat.id, "anti_flood", key, value)
            updated.append(f"{key}={value}")

    if not updated:
        await update.message.reply_text(
            "Используйте формат: /flood_config cooldown=3 enabled=1 warning=Сообщение",
        )
        return

    await update.message.reply_text("Настройки сохранены: " + ", ".join(updated))


async def flood_status(update: Update, context: CallbackContext, db: "DatabaseManager") -> None:
    chat = update.effective_chat
    if not chat:
        return
    settings = db.get_module_settings(chat.id, "anti_flood")
    await update.message.reply_text(
        "\n".join(
            [
                "Текущие настройки анти-флуда:",
                f"Включен: {'да' if settings.get('enabled', '1') == '1' else 'нет'}",
                f"Задержка: {settings.get('cooldown', FLOOD_COOLDOWN_SECONDS)} сек.",
                f"Предупреждение: {settings.get('warning', FLOOD_WARNING)}",
            ]
        )
    )


def add_handlers(application: Application, db: "DatabaseManager") -> None:
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, check_flood, block=False, defaults={"db": db}),
        group=1,
    )
    application.add_handler(CommandHandler("flood_config", flood_settings, block=False, defaults={"db": db}))
    application.add_handler(CommandHandler("flood_status", flood_status, block=False, defaults={"db": db}))
