from typing import Any
from collections.abc import Callable

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from tradingagents.llm import ChatModel
from tradingagents.agents.utils.agent_utils import get_stock_data, get_indicators
from tradingagents.agents.utils.agent_states import AgentState

_SYSTEM_PROMPT = """You are an expert technical analyst with deep expertise in chart patterns, \
price action, and quantitative indicators.

Analyze the stock {ticker} as of {current_date} using your available tools to retrieve price data \
and technical indicators. Produce a structured technical analysis report covering:

1. **Trend Analysis** — Moving averages (SMA20, SMA50, SMA200), trend direction and strength
2. **Momentum** — RSI (overbought/oversold), MACD (signal crossovers), Stochastic
3. **Volatility** — Bollinger Bands (squeeze/expansion), ATR
4. **Volume** — Volume trend and confirmation of price moves
5. **Support & Resistance** — Key price levels from recent price history
6. **Overall Technical Outlook** — Bullish / Bearish / Neutral with confidence level and key risks

Be specific: cite actual indicator values and what they signal. Keep the report concise and actionable.

Available tools: {tool_names}"""


def create_technical_analyst(llm: ChatModel) -> Callable[[AgentState], dict[str, Any]]:
    """Creates a technical analyst node for the trading graph."""

    def technical_analyst_node(state: AgentState) -> dict[str, Any]:
        tools = [get_stock_data, get_indicators]

        prompt = ChatPromptTemplate.from_messages([
            ("system", _SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="messages"),
        ])
        prompt = prompt.partial(tool_names=", ".join([t.name for t in tools]))
        prompt = prompt.partial(current_date=state.trade_date)
        prompt = prompt.partial(ticker=state.company_of_interest)

        chain = prompt | llm.bind_tools(tools)
        result = chain.invoke(state.messages)
        report = "" if result.tool_calls else result.content

        return {"messages": [result], "technical_report": report}

    return technical_analyst_node
