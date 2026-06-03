import re
from typing import Optional

import requests

from elliott_wave.config import settings
from elliott_wave.models.instrument import Instrument
from elliott_wave.utils.logging import get_logger
from elliott_wave.utils.network import get_requests_kwargs

logger = get_logger(__name__)


class InstrumentResolver:
    OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"

    def resolve(self, symbol: Optional[str] = None, isin: Optional[str] = None) -> Instrument:
        if symbol:
            return Instrument(symbol=symbol.upper(), isin=isin)

        if not isin:
            raise ValueError("Either symbol or isin must be provided")

        if not self._is_valid_isin(isin):
            raise ValueError(f"Invalid ISIN format: {isin}")

        resolved = self._resolve_isin_openfigi(isin)
        if resolved:
            return resolved

        raise ValueError(
            "Unable to resolve ISIN to ticker. Configure OpenFIGI API access or provide symbol directly."
        )

    def _is_valid_isin(self, isin: str) -> bool:
        return bool(re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}[0-9]", isin.upper()))

    def _resolve_isin_openfigi(self, isin: str) -> Instrument | None:
        headers = {"Content-Type": "application/json"}
        if settings.openfigi_api_key:
            headers["X-OPENFIGI-APIKEY"] = settings.openfigi_api_key

        payload = [{"idType": "ID_ISIN", "idValue": isin.upper()}]

        try:
            request_kwargs = get_requests_kwargs()
            response = requests.post(
                self.OPENFIGI_URL,
                json=payload,
                headers=headers,
                timeout=15,
                **request_kwargs,
            )
            response.raise_for_status()
            data = response.json()
            if not data or "data" not in data[0] or not data[0]["data"]:
                return None

            item = data[0]["data"][0]
            ticker = item.get("ticker")
            exch = item.get("exchCode")
            security_type = item.get("securityType")
            return Instrument(
                symbol=ticker,
                isin=isin.upper(),
                exchange=exch,
                asset_type=security_type,
            )
        except requests.RequestException as exc:
            logger.warning("OpenFIGI request failed for ISIN %s: %s", isin, exc)
            return None