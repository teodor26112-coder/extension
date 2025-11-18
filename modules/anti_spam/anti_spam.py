"""Простейший фильтр спам-сообщений."""
from __future__ import annotations

from typing import TYPE_CHECKING

from telegram import Update
from telegram.ext import Application, CallbackContext, CommandHandler, ContextTypes, MessageHandler, filters

from config import SPAM_KEYWORDS, SPAM_NOTIFICATION

if TYPE_CHECKING:
    from database.manager import DatabaseManager


async def check_spam(update: Update, context: CallbackContext) -> None:
    message = update.message
    if not message:
        return
    text = message.text or ""
    if any(keyword.lower() in text.lower() for keyword in SPAM_KEYWORDS):
        await message.delete()
        await message.reply_text(SPAM_NOTIFICATION)
        context.chat_data["is_spam"] = True
    else:
        context.chat_data.pop("is_spam", None)


async def manual_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Команда /check_spam для проверки конкретного текста."""
    await check_spam(update, context)
    if "is_spam" not in context.chat_data:
        await update.message.reply_text("Сообщение прошло проверку.")


def add_handlers(application: Application, db: "DatabaseManager") -> None:
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, check_spam), group=0)
    application.add_handler(CommandHandler("check_spam", manual_check), group=0)
