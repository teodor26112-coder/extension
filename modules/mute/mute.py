"""Голосование за мут нарушителей."""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from telegram import Update
from telegram.constants import ChatPermissions
from telegram.ext import Application, CommandHandler, ContextTypes

from config import MUTE_DURATION_SECONDS, MUTE_VOTE_THRESHOLD

if TYPE_CHECKING:
    from database.manager import DatabaseManager


async def start_vote(update: Update, context: ContextTypes.DEFAULT_TYPE, db: "DatabaseManager") -> None:
    """Создать или продолжить голосование против указанного пользователя."""
    chat = update.effective_chat
    message = update.message
    if not chat or not message:
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

    expires = datetime.utcnow() + timedelta(minutes=5)
    votes = db.add_vote(chat.id, target_user.id, expires)

    if votes >= MUTE_VOTE_THRESHOLD:
        await chat.restrict_member(
            target_user.id,
            permissions=ChatPermissions(can_send_messages=False),
            until_date=datetime.utcnow() + timedelta(seconds=MUTE_DURATION_SECONDS),
        )
        db.reset_votes(chat.id, target_user.id)
        await message.reply_text(
            f"Порог голосов достигнут. {target_user.mention_html()} получил мут на {MUTE_DURATION_SECONDS // 60} минут.",
            parse_mode="HTML",
        )
    else:
        remaining = MUTE_VOTE_THRESHOLD - votes
        await message.reply_text(
            f"Голос учтён. Осталось {remaining} голос(ов) для мьюта {target_user.mention_html()}.",
            parse_mode="HTML",
        )


def add_handlers(application: Application, db: "DatabaseManager") -> None:
    application.add_handler(CommandHandler("mute_vote", start_vote, block=False, defaults={"db": db}))
