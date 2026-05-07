#!/usr/bin/env python3
"""Patches the installed TradingAgents library to add technical analyst support."""

import os
import shutil
import site

def find_pkg() -> str:
    for sp in site.getsitepackages():
        p = os.path.join(sp, "tradingagents")
        if os.path.isdir(p):
            return p
    raise RuntimeError("tradingagents package not found in site-packages")

pkg = find_pkg()
print(f"Patching TradingAgents at: {pkg}")

# ── 1. Copy technical_analyst.py into the analysts directory ─────────────────
src = os.path.join(os.path.dirname(__file__), "technical_analyst.py")
dst = os.path.join(pkg, "agents/analysts/technical_analyst.py")
shutil.copy(src, dst)
print(f"  ✓ Copied technical_analyst.py → {dst}")

# ── 2. Patch agent_states.py — add technical_report field ────────────────────
states_path = os.path.join(pkg, "agents/utils/agent_states.py")
with open(states_path) as f:
    content = f.read()

if "technical_report" not in content:
    content = content.replace(
        '    fundamentals_report: str = Field(',
        (
            '    technical_report: str = Field(\n'
            '        default="",\n'
            '        title="Technical Report",\n'
            '        description="Technical analysis report produced by the Technical Analyst",\n'
            '    )\n'
            '    fundamentals_report: str = Field('
        ),
    )
    with open(states_path, "w") as f:
        f.write(content)
    print("  ✓ Patched agent_states.py — added technical_report field")
else:
    print("  · agent_states.py already patched")

# ── 3. Patch conditional_logic.py — add should_continue_technical ─────────────
cond_path = os.path.join(pkg, "graph/conditional_logic.py")
with open(cond_path) as f:
    content = f.read()

if "should_continue_technical" not in content:
    new_method = (
        '    def should_continue_technical(\n'
        '        self, state: AgentState\n'
        '    ) -> Literal["tools_technical", "Msg Clear Technical"]:\n'
        '        """Determine whether to continue technical analysis or clear messages."""\n'
        '        return "tools_technical" if state.messages[-1].tool_calls else "Msg Clear Technical"\n'
        '\n'
    )
    content = content.replace(
        "    def should_continue_debate(",
        new_method + "    def should_continue_debate(",
    )
    # Extend the Literal import to include the new strings
    content = content.replace(
        "from typing import Literal",
        "from typing import Literal",
    )
    with open(cond_path, "w") as f:
        f.write(content)
    print("  ✓ Patched conditional_logic.py — added should_continue_technical")
else:
    print("  · conditional_logic.py already patched")

# ── 4. Patch graph/setup.py — add technical to analyst_creators ───────────────
setup_path = os.path.join(pkg, "graph/setup.py")
with open(setup_path) as f:
    content = f.read()

if '"technical": create_technical_analyst' not in content:
    # Add import
    content = content.replace(
        "from tradingagents.agents import (",
        "from tradingagents.agents import (\n    create_technical_analyst,",
    )
    # Add to analyst_creators dict
    content = content.replace(
        '"fundamentals": create_fundamentals_analyst,',
        '"fundamentals": create_fundamentals_analyst,\n            "technical": create_technical_analyst,',
    )
    with open(setup_path, "w") as f:
        f.write(content)
    print("  ✓ Patched setup.py — added technical to analyst_creators")
else:
    print("  · setup.py already patched")

# ── 5. Patch agents/__init__.py — export create_technical_analyst ─────────────
init_path = os.path.join(pkg, "agents/__init__.py")
with open(init_path) as f:
    content = f.read()

if "create_technical_analyst" not in content:
    content = content.replace(
        "from .analysts.social_media_analyst import create_social_media_analyst",
        (
            "from .analysts.social_media_analyst import create_social_media_analyst\n"
            "from .analysts.technical_analyst import create_technical_analyst"
        ),
    )
    content = content.replace(
        '    "create_social_media_analyst",',
        '    "create_social_media_analyst",\n    "create_technical_analyst",',
    )
    with open(init_path, "w") as f:
        f.write(content)
    print("  ✓ Patched agents/__init__.py — exported create_technical_analyst")
else:
    print("  · agents/__init__.py already patched")

print("All patches applied successfully.")
