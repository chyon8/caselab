"use client";

import { useApp } from "@/state/AppContext";
import styles from "./Settings.module.css";

const NOTIFICATION_TOGGLES = [
  {
    key: "done",
    label: "완료 전환 알림",
    desc: "프로젝트가 완료(성공/취소)로 전환되면 리뷰 작성 알림을 받습니다",
  },
  {
    key: "cancel",
    label: "중도 취소 알림",
    desc: "담당 프로젝트가 중도 취소되면 즉시 알림을 받습니다",
  },
  {
    key: "digest",
    label: "주간 케이스 다이제스트",
    desc: "한 주간 축적된 사례와 리뷰를 월요일 오전에 요약 발송",
  },
];

const API_ROWS = [
  { name: "검수 어드민", status: "연결됨 · 5분 전 동기화" },
  { name: "카드 어드민", status: "연결됨 · 12분 전 동기화" },
  { name: "계약 어드민", status: "연결됨 · 3분 전 동기화" },
];

function Switch({
  on,
  variant,
  onClick,
}: {
  on: boolean;
  variant: "slack" | "green";
  onClick: () => void;
}) {
  const onClass = variant === "slack" ? styles["on-slack"] : styles["on-green"];
  return (
    <div className={`${styles.track} ${on ? onClass : ""}`} onClick={onClick}>
      <div className={`${styles.knob} ${on ? styles.on : ""}`} />
    </div>
  );
}

export default function Settings() {
  const app = useApp();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>설정</h1>

      <div className={styles["section-head"]}>
        <span className={styles["section-title"]}>슬랙 알림 연동</span>
      </div>
      <div className={styles["slack-card"]}>
        <div className={styles["slack-row"]}>
          <div className={styles["slack-id"]}>
            <div className={styles["slack-icon"]}>#</div>
            <div>
              <div className={styles["slack-name"]}>Slack 워크스페이스</div>
              <div
                className={`${styles["slack-status"]} ${app.slackConnected ? styles.connected : ""}`}
              >
                {app.slackConnected ? "연결됨 · #caselab-workspace" : "연결되지 않음"}
              </div>
            </div>
          </div>
          <button
            className={`${styles["connect-btn"]} ${app.slackConnected ? styles.connected : ""}`}
            onClick={app.toggleSlackConnected}
          >
            {app.slackConnected ? "연결 해제" : "Slack 연동하기"}
          </button>
        </div>

        {app.slackConnected && (
          <>
            <div className={styles["channel-row"]}>
              <div className={styles["channel-label"]}>알림 채널</div>
              <input
                className={styles["channel-input"]}
                value={app.slackChannel}
                onChange={(e) => app.setSlackChannel(e.target.value)}
              />
            </div>
            <div className={styles["slack-toggles"]}>
              <div className={styles["slack-toggle-row"]}>
                <div className={styles["slack-toggle-label"]}>
                  프로젝트 상태 변경 시 알림
                </div>
                <Switch
                  on={app.toggles.slackStatus}
                  variant="slack"
                  onClick={() => app.toggle("slackStatus")}
                />
              </div>
              <div className={styles["slack-toggle-row"]}>
                <div className={styles["slack-toggle-label"]}>
                  신규 개발사 Q&A 등록 시 알림
                </div>
                <Switch
                  on={app.toggles.slackQna}
                  variant="slack"
                  onClick={() => app.toggle("slackQna")}
                />
              </div>
            </div>
            <div className={styles["preview-wrap"]}>
              <div className={styles["preview-label"]}>미리보기</div>
              <div className={styles.preview}>
                <div className={styles["preview-avatar"]} />
                <div>
                  <div className={styles["preview-name"]}>
                    CaseLab{" "}
                    <span className={styles["preview-channel"]}>· {app.slackChannel}</span>
                  </div>
                  <div className={styles["preview-text"]}>
                    🔔 한빛보험서비스 OCR 증권분석 앱 — 상태가 <b>모집 → 계약</b>으로
                    변경되었습니다. (검수담당: 장수룡)
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className={styles["section-head"]}>
        <span className={styles["section-title"]}>알림</span>
      </div>
      <div className={styles["toggle-list"]}>
        {NOTIFICATION_TOGGLES.map((t) => (
          <div key={t.key} className={styles["toggle-item"]}>
            <div>
              <div className={styles["toggle-label"]}>{t.label}</div>
              <div className={styles["toggle-desc"]}>{t.desc}</div>
            </div>
            <Switch
              on={app.toggles[t.key]}
              variant="green"
              onClick={() => app.toggle(t.key)}
            />
          </div>
        ))}
      </div>

      <div className={styles["section-head"]}>
        <span className={styles["section-title"]}>어드민 API 연동</span>
      </div>
      <div className={styles["api-list"]}>
        {API_ROWS.map((a) => (
          <div key={a.name} className={styles["api-row"]}>
            <div className={styles["api-id"]}>
              <div className={styles["api-dot"]} />
              <div className={styles["api-name"]}>{a.name}</div>
            </div>
            <div className={styles["api-status"]}>{a.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
