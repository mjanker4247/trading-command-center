"use client";

import type { InvestorProfile } from "@/lib/types";
import { SectionCard } from "@/components/settings/SectionCard";
import {
  INVESTOR_DNA_HORIZON_LABELS,
  INVESTOR_DNA_RISK_LABELS,
  INVESTOR_DNA_STYLE_LABELS,
} from "@/components/settings/constants";
import { BTN_AI_SM_CLASS, BTN_SECONDARY_CLASS, STATUS_CONFIGURED_CLASS } from "@/lib/uiClasses";

type InvestorDnaSummarySectionProps = {
  isLoading: boolean;
  profile: InvestorProfile | null | undefined;
};

export function InvestorDnaSummarySection({ isLoading, profile }: InvestorDnaSummarySectionProps) {
  return (
    <SectionCard id="investor-dna" title="Investor DNA" description="Personalize AI insights with your investment context.">
      <div className="px-4 py-4">
        {isLoading ? (
          <div className="h-8 bg-input rounded-sm animate-pulse w-48" />
        ) : profile ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-6 text-sm">
              {profile.time_horizon && (
                <div>
                  <span className="text-muted text-xs">Horizon</span>
                  <p className="text-fg">{INVESTOR_DNA_HORIZON_LABELS[profile.time_horizon] ?? profile.time_horizon}</p>
                </div>
              )}
              {profile.risk_willingness && (
                <div>
                  <span className="text-muted text-xs">Risk</span>
                  <p className="text-fg">{INVESTOR_DNA_RISK_LABELS[profile.risk_willingness] ?? profile.risk_willingness}</p>
                </div>
              )}
              {profile.investment_style && (
                <div>
                  <span className="text-muted text-xs">Style</span>
                  <p className="text-fg">{INVESTOR_DNA_STYLE_LABELS[profile.investment_style] ?? profile.investment_style}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className={STATUS_CONFIGURED_CLASS}>● DNA active</span>
              <a href="/settings/investor-profile" className={BTN_SECONDARY_CLASS}>Edit profile</a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted text-sm">Personalize your AI insights by sharing your investment context.</p>
            <a href="/settings/investor-profile" className={`${BTN_AI_SM_CLASS} shrink-0`}>Set up Investor DNA</a>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
