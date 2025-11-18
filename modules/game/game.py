"""Игровой модуль: начисление опыта и уровней."""
from __future__ import annotations

from typing import TYPE_CHECKING

from telegram import Update
from telegram.ext import Application, ContextTypes, MessageHandler, filters

from config import XP_PER_LEVEL, XP_PER_MESSAGE

if TYPE_CHECKING:
    from database.manager import DatabaseManager


async def reward_experience(update: Update, context: ContextTypes.DEFAULT_TYPE, db: "DatabaseManager") -> None:
    message = update.message
    chat = update.effective_chat
    user = update.effective_user
    if not message or not chat or not user:
        return

    db.register_chat(chat.id, chat.title or "Неизвестный чат")
    db.record_message(chat.id, user.id, user.username)
    xp, new_level, previous_level = db.add_xp(user.id, user.username, XP_PER_MESSAGE, XP_PER_LEVEL)

    if new_level > previous_level:
        await message.reply_text(
            f"Поздравляем, {user.mention_html()}! Ваш уровень повысился до {new_level}.",
            parse_mode="HTML",
        )


def add_handlers(application: Application, db: "DatabaseManager") -> None:
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, reward_experience, block=False, defaults={"db": db}),
        group=2,
    )
