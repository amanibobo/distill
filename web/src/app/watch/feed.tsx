import { swatch } from "@/lib/change-types";
import { shortDate } from "@/lib/format";
import type { FeedItem } from "./flow";
import { isNews, sentence } from "./model";
import atlas from "../map/atlas.module.css";
import styles from "./watch.module.css";

function quiet(item: FeedItem, watch: string) {
  if (item.baseline) return "Baseline pass, no change";
  if (!item.changes.length) return "No change";
  return `No new change. ${item.changes.map((c) => sentence(c, watch, item.date)).join(". ")}`;
}

export function Feed({ items, watch, total }: { items: FeedItem[]; watch: string; total: number }) {
  return (
    <ol className={`${atlas.list} ${styles.feed}`}>
      {items.flatMap((item) => {
        const news = item.changes.filter(isNews);
        if (!news.length) {
          return [
            <li key={item.date} className={styles.quiet}>
              <span className={styles.quietDate}>{shortDate(item.date)}</span>
              <span>{quiet(item, watch)}</span>
            </li>,
          ];
        }
        return news.map((c) => (
          <li key={`${item.date}:${c.change_type}`} className={styles.alert}>
            <span className={atlas.dot} style={{ background: swatch(c.change_type), marginTop: 6 }} aria-hidden />
            <span className={atlas.rowText}>
              <span className={styles.alertText}>{sentence(c, watch, item.date)}</span>
              <span className={atlas.rowSub}>
                Pass {item.index + 1} of {total}
              </span>
            </span>
          </li>
        ));
      })}
    </ol>
  );
}
