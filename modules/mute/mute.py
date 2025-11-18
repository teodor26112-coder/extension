"""Голосование за мут нарушителей."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from telegram import ChatPermissions, Update
from telegram.ext import Application, CommandHandler, ContextTypes

from config import MUTE_DURATION_SECONDS, MUTE_VOTE_THRESHOLD
from modules.utils import is_chat_admin

if TYPE_CHECKING:
    from database.manager import DatabaseManager


async def start_vote(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Создать или продолжить голосование против указанного пользователя."""
    chat = update.effective_chat
    message = update.message
    if not chat or not message:
        return

    db = context.application.bot_data.get("db")  # type: ignore[assignment]
    if not db:
        return

    target_user = None
    if message.reply_to_message and message.reply_to_message.from_user:
        target_user = message.reply_to_message.from_user
    elif context.args:
        arg = context.args[0]
        try:
            user_id = int(arg)
            member = await chat.get_member(user_id)
            target_user = member.user
        except (ValueError, Exception):
            await message.reply_text("Укажите ID пользователя или ответьте на его сообщение.")
            return
    else:
        await message.reply_text("Ответьте командой /mute_vote на сообщение нарушителя или укажите его ID.")
        return

    settings = db.get_module_settings(chat.id, "mute")
    threshold = int(settings.get("threshold", MUTE_VOTE_THRESHOLD))
    duration = int(settings.get("duration", MUTE_DURATION_SECONDS))

    expires = datetime.utcnow() + timedelta(minutes=5)
    votes = db.add_vote(chat.id, target_user.id, expires)

    if votes >= threshold:
        await chat.restrict_member(
            target_user.id,
            permissions=ChatPermissions(can_send_messages=False),
            until_date=datetime.utcnow() + timedelta(seconds=duration),
        )
        db.reset_votes(chat.id, target_user.id)
        await message.reply_text(
            f"Порог голосов достигнут. {target_user.mention_html()} получил мут на {duration // 60} минут.",
            parse_mode="HTML",
        )
    else:
        remaining = max(threshold - votes, 0)
        await message.reply_text(
            f"Голос учтён. Осталось {remaining} голос(ов) для мьюта {target_user.mention_html()}.",
            parse_mode="HTML",
        )


async def mute_settings(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if not chat:
        return
    db = context.application.bot_data.get("db")  # type: ignore[assignment]
    if not db:
        return
    if not await is_chat_admin(update):
        await update.message.reply_text("Только администратор может менять настройки.")
        return

    updated = []
    for arg in context.args:
        if "=" not in arg:
            continue
        key, value = arg.split("=", 1)
        key = key.strip().lower()
        value = value.strip()
        if key in {"threshold", "duration"}:
            db.set_chat_setting(chat.id, "mute", key, value)
            updated.append(f"{key}={value}")

    if not updated:
        await update.message.reply_text(
            "Используйте: /mute_config threshold=3 duration=300",
        )
        return

    await update.message.reply_text("Настройки сохранены: " + ", ".join(updated))


async def mute_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat = update.effective_chat
    if not chat:
        return
    db = context.application.bot_data.get("db")  # type: ignore[assignment]
    if not db:
        return
    settings = db.get_module_settings(chat.id, "mute")
    await update.message.reply_text(
        "\n".join(
            [
                "Настройки голосования за мут:",
                f"Порог голосов: {settings.get('threshold', MUTE_VOTE_THRESHOLD)}",
                f"Длительность: {int(settings.get('duration', MUTE_DURATION_SECONDS)) // 60} минут",
            ]
        )
    )


def add_handlers(application: Application, _: "DatabaseManager") -> None:
    application.add_handler(CommandHandler("mute_vote", start_vote, block=False))
    application.add_handler(CommandHandler("mute_config", mute_settings, block=False))
    application.add_handler(CommandHandler("mute_status", mute_status, block=False))
