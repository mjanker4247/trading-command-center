import aiosmtplib
from email.message import EmailMessage

from app.database import AsyncSessionLocal
from app.services.smtp_settings_service import SmtpRuntime, get_smtp_runtime


async def _load_runtime() -> SmtpRuntime | None:
    async with AsyncSessionLocal() as db:
        return await get_smtp_runtime(db)


async def _send(msg: EmailMessage, runtime: SmtpRuntime) -> None:
    await aiosmtplib.send(
        msg,
        hostname=runtime.host,
        port=runtime.port,
        username=runtime.user or None,
        password=runtime.password or None,
        start_tls=runtime.effective_start_tls,
        use_tls=runtime.use_tls,
    )


async def send_run_complete_email(to: str, ticker: str, verdict: str, run_id: str, frontend_url: str) -> None:
    verdict_upper = verdict.upper()
    run_url = f"{frontend_url.rstrip('/')}/runs/{run_id}"
    runtime = await _load_runtime()
    if runtime is None:
        print(f"[email stub] Run complete for {to}: {ticker} → {verdict_upper}  {run_url}")
        return
    msg = EmailMessage()
    msg["From"] = runtime.from_address
    msg["To"] = to
    msg["Subject"] = f"AgentFloor: {ticker} analysis complete — {verdict_upper}"
    msg.set_content(
        f"Your {ticker} analysis has finished.\n\n"
        f"Verdict: {verdict_upper}\n\n"
        f"View the full report:\n{run_url}\n"
    )
    await _send(msg, runtime)


async def send_invite_email(to: str, invite_url: str) -> None:
    runtime = await _load_runtime()
    if runtime is None:
        print(f"[email stub] Invite URL for {to}: {invite_url}")
        return
    msg = EmailMessage()
    msg["From"] = runtime.from_address
    msg["To"] = to
    msg["Subject"] = "You're invited to AgentFloor"
    msg.set_content(f"Click to join AgentFloor:\n{invite_url}\n\nThis link expires in 48 hours.")
    await _send(msg, runtime)
