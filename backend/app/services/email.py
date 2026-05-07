import aiosmtplib
from email.message import EmailMessage
from app.config import settings


async def send_run_complete_email(to: str, ticker: str, verdict: str, run_id: str, frontend_url: str) -> None:
    verdict_upper = verdict.upper()
    run_url = f"{frontend_url.rstrip('/')}/runs/{run_id}"
    if not settings.smtp_host:
        print(f"[email stub] Run complete for {to}: {ticker} → {verdict_upper}  {run_url}")
        return
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = f"AgentFloor: {ticker} analysis complete — {verdict_upper}"
    msg.set_content(
        f"Your {ticker} analysis has finished.\n\n"
        f"Verdict: {verdict_upper}\n\n"
        f"View the full report:\n{run_url}\n"
    )
    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=True,
    )


async def send_invite_email(to: str, invite_url: str) -> None:
    if not settings.smtp_host:
        print(f"[email stub] Invite URL for {to}: {invite_url}")
        return
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = "You're invited to AgentFloor"
    msg.set_content(f"Click to join AgentFloor:\n{invite_url}\n\nThis link expires in 48 hours.")
    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        start_tls=True,
    )
