"""Простейший фильтр спам-сообщений."""
from __future__ import annotations

from typing import TYPE_CHECKING, List

from telegram import Update
from telegram.ext import Application, CallbackContext, CommandHandler, ContextTypes, MessageHandler, filters

from config import SPAM_KEYWORDS, SPAM_NOTIFICATION
from modules.utils import is_chat_admin

if TYPE_CHECKING:
    from database.manager import DatabaseManager


def _load_keywords(settings: dict) -> List[str]:
    raw_keywords = settings.get("keywords")
    if raw_keywords:
        return [item.strip() for item in raw_keywords.split(",") if item.strip()]
    return SPAM_KEYWORDS


async def check_spam(update: Update, context: CallbackContext, db: "DatabaseManager") -> None:
    message = update.message
    chat = update.effective_chat
    if not message or not chat:
        return

    settings = db.get_module_settings(chat.id, "anti_spam")
    if settings.get("enabled", "1") != "1":
        return

    text = message.text or ""
    keywords = _load_keywords(settings)
    if any(keyword.lower() in text.lower() for keyword in keywords):
        await message.delete()
        await message.reply_text(settings.get("notification", SPAM_NOTIFICATION))
        context.chat_data["is_spam"] = True
    else:
        context.chat_data.pop("is_spam", None)


async def manual_check(update: Update, context: ContextTypes.DEFAULT_TYPE, db: "DatabaseManager") -> None:
    """Команда /check_spam для проверки конкретного текста."""
    await check_spam(update, context, db)
    if "is_spam" not in context.chat_data:
        await update.message.reply_text("Сообщение прошло проверку.")


async def spam_settings(update: Update, context: ContextTypes.DEFAULT_TYPE, db: "DatabaseManager") -> None:
    """Настройка анти-спама для чата (ключ=значение через пробел)."""
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
        if key in {"keywords", "notification", "enabled"}:
            db.set_chat_setting(chat.id, "anti_spam", key, value)
            updated.append(f"{key}={value}")

    if not updated:
        await update.message.reply_text(
            "Используйте формат: /spam_config keywords=слово1,слово2 enabled=1 notification=Текст предупреждения",
        )
        return

    await update.message.reply_text("Настройки сохранены: " + ", ".join(updated))


async def spam_status(update: Update, context: ContextTypes.DEFAULT_TYPE, db: "DatabaseManager") -> None:
    chat = update.effective_chat
    if not chat:
        return
    settings = db.get_module_settings(chat.id, "anti_spam")
    await update.message.reply_text(
        "\n".join(
            [
                "Текущие настройки анти-спама:",
                f"Включен: {'да' if settings.get('enabled', '1') == '1' else 'нет'}",
                f"Ключевые слова: {settings.get('keywords', ', '.join(SPAM_KEYWORDS))}",
                f"Уведомление: {settings.get('notification', SPAM_NOTIFICATION)}",
            ]
        )
    )


def add_handlers(application: Application, db: "DatabaseManager") -> None:
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, check_spam, block=False, defaults={"db": db}),
        group=0,
    )
    application.add_handler(CommandHandler("check_spam", manual_check, block=False, defaults={"db": db}), group=0)
    application.add_handler(CommandHandler("spam_config", spam_settings, block=False, defaults={"db": db}))
    application.add_handler(CommandHandler("spam_status", spam_status, block=False, defaults={"db": db}))
