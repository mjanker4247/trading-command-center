from typing import Any, Dict

from elliott_wave.config import settings


def get_proxy_dict() -> Dict[str, str]:
    proxies: Dict[str, str] = {}
    if settings.http_proxy:
        proxies["http"] = settings.http_proxy
    if settings.https_proxy:
        proxies["https"] = settings.https_proxy
    return proxies


def get_requests_kwargs() -> Dict[str, Any]:
    """
    Common kwargs for requests.* calls (proxies and verify).
    """
    kwargs: Dict[str, Any] = {}
    proxies = get_proxy_dict()
    if proxies:
        kwargs["proxies"] = proxies
    if settings.ca_bundle_path:
        kwargs["verify"] = settings.ca_bundle_path
    return kwargs