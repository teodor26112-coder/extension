"""Игровой модуль: начисление опыта и уровней."""
from __future__ import annotations

from typing import TYPE_CHECKING

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

from config import XP_PER_LEVEL, XP_PER_MESSAGE
from modules.utils import is_chat_admin

if TYPE_CHECKING:
    from database.manager import DatabaseManager


async def reward_experience(update: Update, context: ContextTypes.DEFAULT_TYPE, db: "DatabaseManager") -> None:
    message = update.message
    chat = update.effective_chat
    user = update.effective_user
    if not message or not chat or not user:
        return

    settings = db.get_module_settings(chat.id, "game")
    if settings.get("enabled", "1") != "1":
        return

    db.register_chat(chat.id, chat.title or "Неизвестный чат")
    db.record_message(chat.id, user.id, user.username)
    xp_per_message = int(settings.get("xp_per_message", XP_PER_MESSAGE))
    xp_per_level = int(settings.get("xp_per_level", XP_PER_LEVEL))
    xp, new_level, previous_level = db.add_xp(user.id, user.username, xp_per_message, xp_per_level)

    if new_level > previous_level:
        await message.reply_text(
            f"Поздравляем, {user.mention_html()}! Ваш уровень повысился до {new_level}.",
            parse_mode="HTML",
        )


async def game_settings(update: Update, context: ContextTypes.DEFAULT_TYPE, db: "DatabaseManager") -> None:
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
        if key in {"xp_per_message", "xp_per_level", "enabled"}:
            db.set_chat_setting(chat.id, "game", key, value)
            updated.append(f"{key}={value}")

    if not updated:
        await update.message.reply_text(
            "Используйте: /game_config xp_per_message=5 xp_per_level=50 enabled=1",
        )
        return

    await update.message.reply_text("Настройки сохранены: " + ", ".join(updated))


async def game_status(update: Update, context: ContextTypes.DEFAULT_TYPE, db: "DatabaseManager") -> None:
    chat = update.effective_chat
    if not chat:
        return
    settings = db.get_module_settings(chat.id, "game")
    await update.message.reply_text(
        "\n".join(
            [
                "Настройки игры:",
                f"Включена: {'да' if settings.get('enabled', '1') == '1' else 'нет'}",
                f"Опыт за сообщение: {settings.get('xp_per_message', XP_PER_MESSAGE)}",
                f"Опыт за уровень: {settings.get('xp_per_level', XP_PER_LEVEL)}",
            ]
        )
    )


def add_handlers(application: Application, db: "DatabaseManager") -> None:
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, reward_experience, block=False, defaults={"db": db}),
        group=2,
    )
    application.add_handler(CommandHandler("game_config", game_settings, block=False, defaults={"db": db}))
    application.add_handler(CommandHandler("game_status", game_status, block=False, defaults={"db": db}))
