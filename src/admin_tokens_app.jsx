import React, { useCallback, useEffect, useState } from "react";
import { adminTokensApi } from "./admin_api.js";
import { getInitData, prepareTelegramWebAppViewport } from "./telegram_init.js";

const ADMIN_TOKEN_KEY = "admin_access_token";
const PAGE_SIZE = 15;

function formatTimeLeft(sec) {
  if (sec <= 0) return "истёк";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

function statusLine(item) {
  if (!item.is_active) return "выключен";
  if (item.used_by_telegram_id != null) {
    const uname = String(item.used_by_telegram_username || "").trim();
    const unamePart = uname ? ` @${uname.replace(/^@+/, "")}` : "";
    return `использован${unamePart} (tg:${item.used_by_telegram_id})`;
  }
  return "свободен";
}

export default function AdminTokensApp() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authErr, setAuthErr] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listErr, setListErr] = useState("");
  const [days, setDays] = useState("30");
  const [creating, setCreating] = useState(false);
  const [deletingCode, setDeletingCode] = useState("");
  const [createErr, setCreateErr] = useState("");
  const [lastCreated, setLastCreated] = useState(null);

  useEffect(() => {
    prepareTelegramWebAppViewport();
    const existing = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (existing) {
      setAuthLoading(false);
      return;
    }

    const initData = getInitData();
    if (!initData) {
      setAuthErr("Откройте эту страницу из Telegram, чтобы подтвердить admin user id.");
      setAuthLoading(false);
      return;
    }

    adminTokensApi
      .loginAdminTelegram(initData)
      .then((res) => {
        localStorage.setItem(ADMIN_TOKEN_KEY, res.access_token);
      })
      .catch((e) => {
        setAuthErr(String(e.message || e));
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListErr("");
    try {
      const res = await adminTokensApi.listCodes(PAGE_SIZE, page * PAGE_SIZE);
      setItems(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      setItems([]);
      setListErr(String(e.message || e));
    } finally {
      setLoadingList(false);
    }
  }, [page]);

  useEffect(() => {
    if (!authLoading && !authErr) loadList();
  }, [authLoading, authErr, page, loadList]);

  function logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAuthErr("Сессия админа завершена. Обновите страницу и войдите заново через Telegram.");
    setItems([]);
    setPage(0);
    setLastCreated(null);
    setListErr("");
  }

  async function createCode(e) {
    e.preventDefault();
    const n = parseInt(String(days).trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 3650) {
      setCreateErr("Укажите целое число дней от 1 до 3650.");
      return;
    }
    setCreating(true);
    setCreateErr("");
    try {
      const res = await adminTokensApi.createCode(n);
      setLastCreated({
        code: res.code,
        expires_at: res.expires_at,
        days: res.days != null ? res.days : n,
      });
      setPage(0);
      await loadList();
    } catch (err) {
      setCreateErr(String(err.message || err));
    } finally {
      setCreating(false);
    }
  }

  async function deleteCode(code) {
    const codeText = String(code || "").trim();
    if (!codeText) return;
    if (!window.confirm(`Удалить код ${codeText}?`)) return;
    setDeletingCode(codeText);
    setListErr("");
    try {
      await adminTokensApi.deleteCode(codeText);
      setItems((prev) => prev.filter((x) => String(x.code || "") !== codeText));
      if (lastCreated?.code === codeText) {
        setLastCreated(null);
      }
      await loadList();
    } catch (e) {
      setListErr(String(e.message || e));
    } finally {
      setDeletingCode("");
    }
  }

  const hasNext = items.length === PAGE_SIZE;

  if (authLoading) {
    return (
      <div className="adminTokensShell">
        <section className="adminTokensCard">
          <h1 className="adminTokensTitle">Коды доступа</h1>
          <p className="adminTokensMuted">Проверка прав администратора…</p>
        </section>
      </div>
    );
  }

  if (authErr) {
    return (
      <div className="adminTokensShell">
        <section className="adminTokensCard">
          <h1 className="adminTokensTitle">Коды доступа</h1>
          <p className="adminTokensErr">{authErr}</p>
          <p className="adminTokensHint">
            Доступ даётся только user id из <code className="adminTokensCode">TELEGRAM_ADMIN_IDS</code>.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="adminTokensShell">
      <header className="adminTokensHeader">
        <div className="adminTokensHeaderRow">
          <h1 className="adminTokensTitle">Коды доступа</h1>
          <button type="button" className="adminTokensBtn adminTokensBtnGhost" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      <section className="adminTokensCard">
        <h2 className="adminTokensSectionTitle">Создать код</h2>
        <form className="adminTokensFormRow" onSubmit={createCode}>
          <label className="adminTokensLabel" htmlFor="days">
            Срок, дней
          </label>
          <input
            id="days"
            className="adminTokensInput adminTokensInputNarrow"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <button
            className="adminTokensBtn adminTokensBtnPrimary"
            type="submit"
            disabled={creating}
          >
            {creating ? "Создание…" : "Создать"}
          </button>
        </form>
        {createErr ? <p className="adminTokensErr">{createErr}</p> : null}
        {lastCreated ? (
          <div className="adminTokensCreated">
            <p className="adminTokensCreatedLabel">Код создан — отправьте пользователю</p>
            <p className="adminTokensCreatedCode">{lastCreated.code}</p>
            <p className="adminTokensCreatedMeta">
              {lastCreated.days} дн. · истекает {lastCreated.expires_at || "—"}
            </p>
          </div>
        ) : null}
      </section>

      <section className="adminTokensCard">
        <div className="adminTokensPager">
          <h2 className="adminTokensSectionTitle adminTokensSectionTitleInline">Список</h2>
          <div className="adminTokensPagerBtns">
            <button
              type="button"
              className="adminTokensBtn adminTokensBtnGhost"
              disabled={page === 0 || loadingList}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Назад
            </button>
            <span className="adminTokensPageNum">стр. {page + 1}</span>
            <button
              type="button"
              className="adminTokensBtn adminTokensBtnGhost"
              disabled={!hasNext || loadingList}
              onClick={() => setPage((p) => p + 1)}
            >
              Вперёд
            </button>
          </div>
        </div>
        {listErr ? <p className="adminTokensErr">{listErr}</p> : null}
        {loadingList ? (
          <p className="adminTokensMuted">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="adminTokensMuted">Пусто</p>
        ) : (
          <ul className="adminTokensList">
            {items.map((row) => (
              <li key={row.code} className="adminTokensRow">
                <div className="adminTokensRowTop">
                  <span className="adminTokensRowCode">{row.code}</span>
                  <div className="adminTokensRowActions">
                    <span className="adminTokensRowLeft">
                      осталось {formatTimeLeft(row.seconds_left ?? 0)}
                    </span>
                    <button
                      type="button"
                      className="adminTokensBtn adminTokensBtnDanger adminTokensBtnSmall"
                      disabled={Boolean(deletingCode)}
                      onClick={() => deleteCode(row.code)}
                    >
                      {deletingCode === row.code ? "Удаление…" : "Удалить"}
                    </button>
                  </div>
                </div>
                <div className="adminTokensRowMeta">
                  {statusLine(row)} · {row.lifetime_days} дн.
                  {row.used_at ? ` · использован ${row.used_at}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
