"use client";
import { useState, useRef, useEffect } from "react";
import type { Run, Report } from "@/lib/types";
import { buildMarkdown } from "@/lib/export/buildMarkdown";
import { useDateFormat } from "@/lib/useDateFormat";
import { parseDateInput } from "@/lib/dateFormat";

interface Props {
  run: Run | undefined;
  report: Report | undefined;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DownloadMenu({ run, report }: Props) {
  const [open, setOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { dateFormat, formatFilenameDate } = useDateFormat();

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const disabled = !report;
  const stem = run && report ? `${run.ticker}-${formatFilenameDate(parseDateInput(run.analysis_date))}-report` : "report";

  function handleJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report.raw_report, null, 2)], { type: "application/json" });
    triggerDownload(blob, `${stem}.json`);
    setOpen(false);
  }

  function handleMarkdown() {
    if (!run || !report) return;
    const blob = new Blob([buildMarkdown(run, report, dateFormat)], { type: "text/markdown" });
    triggerDownload(blob, `${stem}.md`);
    setOpen(false);
  }

  async function handlePdf() {
    if (!run || !report) return;
    setPdfLoading(true);
    setOpen(false);
    try {
      const [{ pdf }, { ReportDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/lib/export/ReportPdf"),
      ]);
      const blob = await pdf(<ReportDocument run={run} report={report} dateFormat={dateFormat} />).toBlob();
      triggerDownload(blob, `${stem}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled || pdfLoading}
        className="text-xs text-muted hover:text-fg border border-input-border rounded-sm px-3 py-1 disabled:opacity-40 flex items-center gap-1.5"
      >
        {pdfLoading ? (
          <>
            <span className="inline-block w-3 h-3 border border-muted border-t-transparent rounded-full animate-spin" />
            Generating PDF…
          </>
        ) : (
          <>
            Download
            <span className="text-muted">▾</span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-elevated border border-input-border rounded-sm shadow-lg z-20 py-1">
          <button
            onClick={handleJson}
            className="w-full text-left px-4 py-2 text-xs text-fg-secondary hover:bg-input hover:text-fg"
          >
            Download JSON
          </button>
          <button
            onClick={handleMarkdown}
            className="w-full text-left px-4 py-2 text-xs text-fg-secondary hover:bg-input hover:text-fg"
          >
            Download Markdown
          </button>
          <button
            onClick={handlePdf}
            className="w-full text-left px-4 py-2 text-xs text-fg-secondary hover:bg-input hover:text-fg"
          >
            Download PDF
          </button>
        </div>
      )}
    </div>
  );
}
