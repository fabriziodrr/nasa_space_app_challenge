import type { GroundReport } from "@/server/agent/contracts";
import { reportContent, reportSource } from "@/client/dashboard/report-content";
import styles from "./ReportData.module.css";

export function ReportData({ report }: { report: GroundReport }) {
  return <div className={styles.groups}>{["self_report", "sensor", "vision", "inference"].map((source) => {
    const findings = report.findings.filter((finding) => finding.source === source);
    if (!findings.length) return null;
    return <section key={source} aria-label={reportSource(source)}><h4>{reportSource(source)}</h4><div className={styles.grid}>
      {findings.map((finding, index) => <article className={styles.card} key={index}>
        {finding.measurements?.length ? <>{finding.measurements.map((item, i) => <div className={styles.reading} key={i}><span>{item.label}</span><strong>{reportContent(item.value)} <small>{item.unit}</small></strong>{item.observedAt ? <time dateTime={item.observedAt}>Observed {new Date(item.observedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time> : <span>Observation time unavailable</span>}{item.simulated && <em>Simulated data</em>}</div>)}<details><summary>Agent context</summary><p>{reportContent(finding.text)}</p></details></> : <><p>{reportContent(finding.text)}</p><time dateTime={report.generatedAt}>Report generated {new Date(report.generatedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time></>}
      </article>)}
    </div></section>;
  })}</div>;
}
