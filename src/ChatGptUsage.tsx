import {useEffect,useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {errorText,request} from "./api";

type UsageSummary = {
  completed_requests: number;
  measured_requests: number;
  input_tokens: number | null;
  output_tokens: number | null;
};

const formatCount = new Intl.NumberFormat();

export default function ChatGptUsage({replyPending}:{replyPending:boolean}) {
  const [open,setOpen] = useState(false);
  const [summary,setSummary] = useState<UsageSummary|null>(null);
  const [summaryError,setSummaryError] = useState("");
  const [dashboardError,setDashboardError] = useState("");

  useEffect(()=>{
    if(!open||replyPending)return;
    let active = true;
    setSummaryError("");
    void request<UsageSummary>("chatgpt_usage_summary",{}).then(result=>{
      if(active)setSummary(result);
    }).catch(()=>{
      if(active)setSummaryError("NOEMA activity is temporarily unavailable.");
    });
    return ()=>{active = false};
  },[open,replyPending]);

  async function openDashboard() {
    setDashboardError("");
    try {
      await invoke("chatgpt_open_usage");
    } catch(error) {
      setDashboardError(errorText(error));
    }
  }

  return <details className="dialogue-usage" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>ChatGPT usage</summary>
    <p><strong>NOEMA activity · Last 7 days</strong></p>
    {summaryError?<p role="alert">{summaryError}</p>:summary?<>
      <dl>
        <div><dt>Completed requests</dt><dd>{formatCount.format(summary.completed_requests)}</dd></div>
        <div><dt>Input tokens</dt><dd>{summary.input_tokens===null?"—":formatCount.format(summary.input_tokens)}</dd></div>
        <div><dt>Output tokens</dt><dd>{summary.output_tokens===null?"—":formatCount.format(summary.output_tokens)}</dd></div>
      </dl>
      {summary.measured_requests<summary.completed_requests&&
        <p className="muted">ChatGPT returned token counts for {formatCount.format(summary.measured_requests)} of {formatCount.format(summary.completed_requests)} requests.</p>}
    </>:<p role="status">Loading NOEMA activity…</p>}
    <p className="muted">Includes all ChatGPT subscription accounts used in this NOEMA library since tracking began in 0.1.17.</p>
    <button type="button" onClick={()=>void openDashboard()}>Manage ChatGPT usage</button>
    <small className="muted">Opens ChatGPT to see your account-wide allowance and reset times.</small>
    {dashboardError&&<p role="alert">{dashboardError}</p>}
  </details>;
}
