import logging
import os
import re
import sys

from telegram import Update
from telegram.error import InvalidToken
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

from config import BOT_TOKEN, DATABASE_PATH
from database.manager import DatabaseManager
from modules import admin, anti_spam, anti_flood, mute, game

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Respond to the /start command with a short greeting."""
    user = update.effective_user
    name = user.mention_html() if user else "пользователь"
    message = (
        "Привет! Я модульный бот для администрирования чатов, защиты от спама\n"
        "и игр с опытом. Используйте /help, чтобы узнать о командах модулей."
    )
    update.message.reply_html(message.format(name=name))


def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Provide a short overview of available commands."""
    help_text = (
        "Доступные команды:\n"
        " /start — приветствие\n"
        " /stats — статистика чата и пользователей (админ-модуль)\n"
        " /check_spam <текст> — проверить сообщение на спам\n"
        " /spam_config, /flood_config, /game_config — настройки модулей (для админов чата)\n"
        " /mute_vote <@user> — запустить голосование за мут\n"
        " Сообщения в чате дают опыт и уровень."
    )
    update.message.reply_text(help_text)


async def register_chat(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Ensure the chat is present in the database before other handlers run."""
    chat = update.effective_chat
    if chat:
        db: DatabaseManager | None = context.application.bot_data.get("db")  # type: ignore[assignment]
        if db:
            db.register_chat(chat.id, chat.title or "Неизвестный чат")


def _sanitize_token(raw_token: str | None) -> str:
    """Return a stripped token and log potential formatting issues."""
    if not raw_token:
        return ""

    token = raw_token.strip()
    if raw_token != token:
        logger.warning("Токен содержал пробелы/переводы строки — они удалены автоматически.")

    token_pattern = re.compile(r"^\d{6,}:[A-Za-z0-9_-]{32,}$")
    if token and not token_pattern.match(token):
        logger.error(
            "Токен не похож на токен BotFather. Проверьте, нет ли лишних символов, пробелов или опечаток."
        )
    return token


def _mask_token(token: str) -> str:
    """Mask the token for logging to help пользователю сверить источник."""
    if len(token) <= 10:
        return "***"
    return f"{token[:6]}***{token[-6:]}"


def main() -> None:
    raw_env_token = os.getenv("BOT_TOKEN")
    raw_config_token = BOT_TOKEN
    token_source = "переменная окружения BOT_TOKEN" if raw_env_token else "config.py"

    token = _sanitize_token(raw_env_token or raw_config_token)
    if not token or token == "YOUR_TOKEN":
        raise RuntimeError("Укажите действительный токен в переменной окружения BOT_TOKEN или config.py")

    logger.info(
        "Используется токен из %s (%s). Если токен не тот, обновите источник и перезапустите бота.",
        token_source,
        _mask_token(token),
    )

    try:
        application = ApplicationBuilder().token(token).build()
    except InvalidToken:
        logger.error(
            "Неверный токен. Убедитесь, что вы скопировали токен полностью и заключили его в кавычки "
            "в config.py или передали через переменную окружения BOT_TOKEN."
        )
        sys.exit(1)

    db_manager = DatabaseManager(DATABASE_PATH)
    db_manager.ensure_schema()
    application.bot_data["db"] = db_manager

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))

    application.add_handler(CommandHandler("register", register_chat))

    admin.add_handlers(application, db_manager)
    anti_spam.add_handlers(application, db_manager)
    anti_flood.add_handlers(application, db_manager)
    mute.add_handlers(application, db_manager)
    game.add_handlers(application, db_manager)

    logger.info("Бот запущен. Ожидание сообщений...")
    try:
        application.run_polling()
    except InvalidToken:
        logger.error(
            "Telegram отклонил токен. Проверьте, что он действителен, не содержит пробелов/переводов строки "
            "и что вы перезапустили бота после изменения токена."
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
