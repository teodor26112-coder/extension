"""Обработчики админ-модуля."""
from __future__ import annotations

from textwrap import dedent
from typing import TYPE_CHECKING

from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes

if TYPE_CHECKING:
    from database.manager import DatabaseManager


async def stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Показать агрегированную статистику и топ пользователей."""
    chat = update.effective_chat
    db = context.application.bot_data.get("db")  # type: ignore[assignment]
    if not db:
        return
    db.register_chat(chat.id, chat.title or "Неизвестный чат")
    numbers = db.get_stats()
    chats = db.list_chats()
    users = db.list_users()

    chat_lines = [
        f"- {name or 'Неизвестный'} (ID {cid}): {messages} сообщений, {subs} подписчиков"
        for cid, name, subs, messages in chats
    ]
    user_lines = [f"- {username or user_id}: {xp} XP, уровень {level}" for user_id, username, xp, level in users]

    message = dedent(
        f"""
        📊 Общая статистика
        Подключено чатов: {numbers['chats']}
        Всего сообщений: {numbers['messages']}
        Зарегистрировано пользователей: {numbers['users']}
        Активных подписок: {numbers['subscriptions']}

        Чаты:
        {chr(10).join(chat_lines) if chat_lines else 'Нет данных'}

        Топ пользователей:
        {chr(10).join(user_lines) if user_lines else 'Нет данных'}
        """
    ).strip()
    await update.message.reply_text(message)


async def activate_subscription(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Пример активации платной подписки для пользователя."""
    db = context.application.bot_data.get("db")  # type: ignore[assignment]
    if not db:
        return
    user = update.effective_user
    if not user:
        return
    db.save_subscription(user.id, {"advanced_admin": True})
    await update.message.reply_text(
        "Подписка активирована на 30 дней. Платные модули будут доступны в будущем релизе."
    )


def add_handlers(application: Application, _: "DatabaseManager") -> None:
    application.add_handler(CommandHandler("stats", stats, block=False))
    application.add_handler(CommandHandler("subscribe", activate_subscription, block=False))
