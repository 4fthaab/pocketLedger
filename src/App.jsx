import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, ResponsiveContainer } from "recharts";
import { auth, provider } from "./firebase";
import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

// ─── THEME ────────────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0D0F14",
  card: "#161A23",
  cardHover: "#1C2130",
  border: "#232838",
  accent: "#4FFFB0",
  accentDim: "rgba(79,255,176,0.12)",
  accentDim2: "rgba(79,255,176,0.06)",
  income: "#4FFFB0",
  expense: "#FF5E7D",
  expenseDim: "rgba(255,94,125,0.12)",
  pending: "#FFB84D",
  pendingDim: "rgba(255,184,77,0.12)",
  text: "#F0F4FF",
  textMuted: "#6B7A99",
  textSub: "#8B9BBB",
  warning: "#FFB84D",
};

const PIE_COLORS = ["#4FFFB0", "#FF5E7D", "#7EB8FF", "#FFB84D", "#C07EFF", "#FF8C5E", "#5EE8FF", "#FF5ECC"];

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmt = (n) => "₹" + Number(n).toLocaleString("en-IN");
const uid = () => Math.random().toString(36).slice(2, 10);
const CUR_MONTH = new Date().toISOString().slice(0, 7);

const getMonthTxns = (transactions, monthKey) => {
  return transactions.filter(t => {
    if (!t.date) return false;

    const d = t.date instanceof Date ? t.date : new Date(t.date);
    const key =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0");
    return key === monthKey;
  });
};

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
function Card({ children, style = {}, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: COLORS.card, borderRadius: 16, border: `1px solid ${COLORS.border}`,
      padding: "16px 20px", ...style,
      cursor: onClick ? "pointer" : "default",
      transition: "background 0.15s",
    }}
      onMouseEnter={e => onClick && (e.currentTarget.style.background = COLORS.cardHover)}
      onMouseLeave={e => onClick && (e.currentTarget.style.background = COLORS.card)}
    >{children}</div>
  );
}

function Tag({ color, children }) {
  return (
    <span style={{ background: color + "20", color, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
      {children}
    </span>
  );
}

function ProgressBar({ value, max, color = COLORS.accent, height = 8 }) {
  const pct = Math.min(100, (value / max) * 100);
  const warn = pct >= 80;
  const c = warn ? COLORS.warning : color;
  return (
    <div style={{ background: COLORS.border, borderRadius: 99, height, overflow: "hidden" }}>
      <div style={{ width: pct + "%", background: c, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
    </div>
  );
}

function Stat({ label, value, color = COLORS.text, sub }) {
  return (
    <div>
      <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 800, fontFamily: "'DM Mono', monospace" }}>{value}</div>
      {sub && <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, style = {} }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>}
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          background: COLORS.bg, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: "10px 14px", color: COLORS.text,
          fontSize: 14, outline: "none", transition: "border 0.15s", ...style
        }}
        onFocus={e => e.target.style.border = `1px solid ${COLORS.accent}`}
        onBlur={e => e.target.style.border = `1px solid ${COLORS.border}`}
      />
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>}
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`,
          borderRadius: 10, padding: "10px 14px", color: COLORS.text,
          fontSize: 14, outline: "none",
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Toggle({ value, onChange, options }) {
  return (
    <div style={{ display: "flex", background: COLORS.bg, borderRadius: 10, padding: 3, border: `1px solid ${COLORS.border}`, marginBottom: 14 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "none",
            background: value === o.value ? (o.color || COLORS.accent) : "transparent",
            color: value === o.value ? "#000" : COLORS.textMuted,
            fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all 0.15s"
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

function Btn({ children, onClick, color = COLORS.accent, style = {}, outline }) {
  return (
    <button onClick={onClick} style={{
      background: outline ? "transparent" : color, color: outline ? color : "#000",
      border: outline ? `1px solid ${color}` : "none",
      borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 14,
      cursor: "pointer", transition: "all 0.15s", ...style
    }}>{children}</button>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.card, borderRadius: 20, border: `1px solid ${COLORS.border}`,
        padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: COLORS.text }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textMuted, fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// DASHBOARD
function Dashboard({ transactions, categories, people, goals, liabilities }) {
  const txns = getMonthTxns(transactions, CUR_MONTH).filter(t => !t.isDeleted);
  const income = txns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = txns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const toReceive = people.filter(p => p.type === "lend").reduce((s, p) => s + p.balance, 0);
  const iOwe = people.filter(p => p.type === "owe").reduce((s, p) => s + p.balance, 0);
  const liabilityTotal = liabilities.reduce((s, l) => s + (l.totalAmount - l.paidAmount), 0);
  const goalsSaved = goals.reduce((s, g) => s + g.savedAmount, 0);
  const netWorth = balance + toReceive - iOwe - liabilityTotal;

  // Pie data
  const catSpend = {};
  txns.filter(t => t.type === "expense").forEach(t => {
    catSpend[t.categoryId] = (catSpend[t.categoryId] || 0) + t.amount;
  });
  const pieData = Object.entries(catSpend).map(([cid, val]) => {
    const cat = categories.find(c => c.id === cid);
    return { name: cat ? cat.name : cid, value: val };
  }).sort((a, b) => b.value - a.value);

  const today = new Date();
  const lineData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);

    const key = d.toISOString().split("T")[0];

    const dayTxns = txns.filter(t => t.date === key);

    lineData.push({
      day: key.slice(-2),
      income: dayTxns
        .filter(t => t.type === "income")
        .reduce((s, t) => s + t.amount, 0),
      expense: dayTxns
        .filter(t => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0),
    });
  }

  // Health meter
  const healthScore = netWorth > 0 ? Math.min(100, (netWorth / 20000) * 100) : 0;
  const healthColor = healthScore > 60 ? COLORS.income : healthScore > 30 ? COLORS.warning : COLORS.expense;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: COLORS.textMuted, fontSize: 12 }}>{new Date().toLocaleString("default", { month: "long", year: "numeric" })}</div>
          <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 22 }}>Dashboard</div>
        </div>
        <div style={{ background: COLORS.accentDim, color: COLORS.accent, borderRadius: 99, padding: "6px 14px", fontSize: 12, fontWeight: 700 }}>
          📅 This Month
        </div>
      </div>

      {/* Main stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Card>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>INCOME</div>
          <div style={{ color: COLORS.income, fontWeight: 800, fontSize: 20, fontFamily: "'DM Mono',monospace" }}>{fmt(income)}</div>
        </Card>
        <Card>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>EXPENSE</div>
          <div style={{ color: COLORS.expense, fontWeight: 800, fontSize: 20, fontFamily: "'DM Mono',monospace" }}>{fmt(expense)}</div>
        </Card>
        <Card>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>BALANCE</div>
          <div style={{ color: balance >= 0 ? COLORS.income : COLORS.expense, fontWeight: 800, fontSize: 20, fontFamily: "'DM Mono',monospace" }}>{fmt(balance)}</div>
        </Card>
      </div>

      {/* Dues & Net */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Card>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>TO RECEIVE</div>
          <div style={{ color: COLORS.pending, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>{fmt(toReceive)}</div>
        </Card>
        <Card>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>I OWE</div>
          <div style={{ color: COLORS.expense, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>{fmt(iOwe)}</div>
        </Card>
        <Card style={{ border: `1px solid ${netWorth >= 0 ? COLORS.income + "44" : COLORS.expense + "44"}` }}>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>NET WORTH</div>
          <div style={{ color: netWorth >= 0 ? COLORS.income : COLORS.expense, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>{fmt(netWorth)}</div>
        </Card>
      </div>

      {/* Financial Health Meter */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: COLORS.text }}>💡 Financial Health</div>
          <Tag color={healthColor}>{healthScore > 60 ? "Healthy" : healthScore > 30 ? "Fair" : "Critical"}</Tag>
        </div>
        <ProgressBar value={healthScore} max={100} color={healthColor} height={10} />
        <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 8 }}>
          Net Worth = Cash + Receivable − Payable − Liabilities = {fmt(netWorth)}
        </div>
      </Card>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Pie */}
        <Card>
          <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>🍕 By Category</div>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 4 }}>
                {pieData.slice(0, 5).map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: COLORS.textSub }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </>
          ) : <div style={{ color: COLORS.textMuted, fontSize: 12, textAlign: "center", padding: "40px 0" }}>No expenses yet</div>}
        </Card>

        {/* Line */}
        <Card>
          <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>📈 Daily Cash Flow</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={lineData}>
              <XAxis dataKey="day" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={40} tickFormatter={v => v > 0 ? "₹" + v / 1000 + "k" : ""} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }} />
              <Line type="monotone" dataKey="income" stroke={COLORS.income} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expense" stroke={COLORS.expense} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Goals quick view */}
      <Card>
        <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>🎯 Saving Goals</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {goals.map(g => (
            <div key={g.id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: COLORS.text, fontSize: 13 }}>{g.icon} {g.name}</span>
                <span style={{ color: COLORS.textMuted, fontSize: 12, fontFamily: "'DM Mono',monospace" }}>
                  {fmt(g.savedAmount)} / {fmt(g.targetAmount)}
                </span>
              </div>
              <ProgressBar value={g.savedAmount} max={g.targetAmount} color={g.color} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ADD TRANSACTION
function AddTransaction({ categories, people, onAdd, onClose, editTxn }) {
  const [type, setType] = useState(editTxn?.type || "expense");
  const [amount, setAmount] = useState(editTxn?.amount?.toString() || "");
  const [categoryId, setCategoryId] = useState(editTxn?.categoryId || categories[0]?.id || "");
  const [note, setNote] = useState(editTxn?.note || "");
  const [date, setDate] = useState(editTxn?.date || "2026-02-23");
  const [spendType, setSpendType] = useState(editTxn?.spendType || "self");
  const [personId, setPersonId] = useState(editTxn?.personId || "");
  const [isRecurring, setIsRecurring] = useState(editTxn?.isRecurring || false);

  const filteredCats = categories.filter(c => type === "income" ? ["salary"].includes(c.id) || c.name.toLowerCase().includes("income") : !["salary"].includes(c.id));
  const allCats = categories;

  const handleSubmit = () => {
    if (!amount || isNaN(+amount)) return;
    onAdd({
      ...(editTxn?.id && { id: editTxn.id }),
      type,
      amount: +amount,
      categoryId,
      note,
      date,
      spendType,
      personId: spendType === "other" ? personId : null,
      isRecurring,
    });
    onClose?.();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Toggle value={type} onChange={setType} options={[
        { value: "expense", label: "💸 Expense", color: COLORS.expense },
        { value: "income", label: "💰 Income", color: COLORS.income }
      ]} />

      <Input label="Amount (₹)" value={amount} onChange={setAmount} type="number" placeholder="0" />

      <div style={{ marginBottom: 14 }}>
        <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Category</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {allCats.map(cat => (
            <button key={cat.id} onClick={() => setCategoryId(cat.id)}
              style={{
                background: categoryId === cat.id ? cat.color + "33" : COLORS.bg,
                border: categoryId === cat.id ? `1.5px solid ${cat.color}` : `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: "6px 12px", color: categoryId === cat.id ? cat.color : COLORS.textMuted,
                fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "all 0.15s"
              }}
            >{cat.icon} {cat.name}</button>
          ))}
        </div>
      </div>

      <Toggle value={spendType} onChange={setSpendType} options={[
        { value: "self", label: "👤 Myself" },
        { value: "other", label: "👥 For Someone" }
      ]} />

      {spendType === "other" && (
        <Select label="Person" value={personId} onChange={setPersonId}
          options={[{ value: "", label: "Select person..." }, ...people.map(p => ({ value: p.id, label: p.name }))]}
        />
      )}

      <Input label="Note" value={note} onChange={setNote} placeholder="Optional note..." />
      <Input label="Date" value={date} onChange={setDate} type="date" />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setIsRecurring(v => !v)}
          style={{ width: 36, height: 20, borderRadius: 10, background: isRecurring ? COLORS.accent : COLORS.border, border: "none", cursor: "pointer", transition: "background 0.15s", position: "relative" }}>
          <div style={{ position: "absolute", top: 2, left: isRecurring ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: "#fff", transition: "left 0.15s" }} />
        </button>
        <span style={{ color: COLORS.textSub, fontSize: 13 }}>Recurring expense</span>
      </div>

      <Btn onClick={handleSubmit} style={{ width: "100%", padding: "12px 0" }}>
        {editTxn ? "💾 Update Transaction" : "➕ Add Transaction"}
      </Btn>
    </div>
  );
}

// TRANSACTIONS
function Transactions({ transactions, categories, people, onDelete, onEdit, onRestore }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (showDeleted ? !t.isDeleted : t.isDeleted) return false;
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterCat !== "all" && t.categoryId !== filterCat) return false;
      const cat = categories.find(c => c.id === t.categoryId);
      const person = t.personId ? people.find(p => p.id === t.personId) : null;
      const searchStr = `${t.note} ${cat?.name || ""} ${person?.name || ""}`.toLowerCase();
      if (search && !searchStr.includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [transactions, search, filterType, filterCat, showDeleted, categories, people]);

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text, marginBottom: 16 }}>📋 Transactions</div>

      {/* Search & filters */}
      <Card style={{ marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search..."
          style={{ width: "100%", boxSizing: "border-box", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 14px", color: COLORS.text, fontSize: 13, outline: "none", marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["all", "income", "expense"].map(v => (
            <button key={v} onClick={() => setFilterType(v)}
              style={{
                padding: "5px 14px", borderRadius: 20, border: `1px solid ${filterType === v ? COLORS.accent : COLORS.border}`,
                background: filterType === v ? COLORS.accentDim : "transparent", color: filterType === v ? COLORS.accent : COLORS.textMuted,
                fontSize: 12, fontWeight: 600, cursor: "pointer"
              }}>
              {v === "all" ? "All" : v === "income" ? "💰 Income" : "💸 Expense"}
            </button>
          ))}
          <button onClick={() => setShowDeleted(v => !v)}
            style={{
              padding: "5px 14px", borderRadius: 20, border: `1px solid ${showDeleted ? COLORS.warning : COLORS.border}`,
              background: showDeleted ? COLORS.pendingDim : "transparent", color: showDeleted ? COLORS.warning : COLORS.textMuted,
              fontSize: 12, fontWeight: 600, cursor: "pointer"
            }}>
            {showDeleted ? "↩ Trash" : "🗑 Trash"}
          </button>
        </div>
      </Card>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: COLORS.textMuted, padding: "40px 0", fontSize: 14 }}>No transactions found</div>
        )}
        {filtered.map(t => {
          const cat = categories.find(c => c.id === t.categoryId);
          const person = t.personId ? people.find(p => p.id === t.personId) : null;
          return (
            <Card key={t.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", opacity: t.isDeleted ? 0.5 : 1 }}>
              <div style={{ fontSize: 26 }}>{cat?.icon || "💳"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>{t.note || cat?.name || "—"}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <Tag color={cat?.color || COLORS.accent}>{cat?.name || "—"}</Tag>
                  {person && <Tag color={COLORS.pending}>👤 {person.name}</Tag>}
                  <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{t.date}</span>
                  {t.isRecurring && <Tag color={COLORS.textMuted}>🔁 Recurring</Tag>}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div style={{
                  color: t.type === "income" ? COLORS.income : COLORS.expense,
                  fontWeight: 800, fontFamily: "'DM Mono',monospace", fontSize: 16
                }}>{t.type === "income" ? "+" : "-"}{fmt(t.amount)}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {!t.isDeleted && (
                    <>
                      <button onClick={() => onEdit(t)} style={{ background: COLORS.accentDim, border: "none", borderRadius: 6, padding: "3px 8px", color: COLORS.accent, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Edit</button>
                      <button onClick={() => onDelete(t.id)} style={{ background: COLORS.expenseDim, border: "none", borderRadius: 6, padding: "3px 8px", color: COLORS.expense, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Delete</button>
                    </>
                  )}
                  {t.isDeleted && (
                    <button onClick={() => onRestore(t.id)} style={{ background: COLORS.pendingDim, border: "none", borderRadius: 6, padding: "3px 8px", color: COLORS.warning, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Restore</button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// DUES
function Dues({ people, onMarkPaid, onAddPerson }) {
  const lend = people.filter(p => p.type === "lend" && p.balance > 0);
  const owe = people.filter(p => p.type === "owe" && p.balance > 0);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueType, setDueType] = useState("lend");

  const handleAdd = () => {
    if (!name || !amount) return;
    onAddPerson({ id: uid(), name, balance: +amount, type: dueType });
    setName(""); setAmount(""); setShowAdd(false);
  };

  const PersonCard = ({ p }) => (
    <Card key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px" }}>
      <div style={{
        width: 40, height: 40, borderRadius: 20, background: p.type === "lend" ? COLORS.accentDim : COLORS.expenseDim,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18
      }}>
        {p.type === "lend" ? "👤" : "👤"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>{p.name}</div>
        <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
          {p.type === "lend" ? "Owes you" : "You owe"}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        <div style={{ color: p.type === "lend" ? COLORS.income : COLORS.expense, fontWeight: 800, fontFamily: "'DM Mono',monospace", fontSize: 16 }}>{fmt(p.balance)}</div>
        <button onClick={() => onMarkPaid(p.id)}
          style={{ background: COLORS.accentDim, border: "none", borderRadius: 6, padding: "4px 10px", color: COLORS.accent, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
          ✓ Settled
        </button>
      </div>
    </Card>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text }}>🤝 Dues</div>
        <Btn onClick={() => setShowAdd(true)} style={{ padding: "8px 16px", fontSize: 12 }}>+ Add</Btn>
      </div>

      {showAdd && (
        <Card style={{ marginBottom: 16 }}>
          <Toggle value={dueType} onChange={setDueType} options={[
            { value: "lend", label: "💰 They owe me", color: COLORS.income },
            { value: "owe", label: "💸 I owe them", color: COLORS.expense }
          ]} />
          <Input label="Person Name" value={name} onChange={setName} placeholder="Enter name" />
          <Input label="Amount" value={amount} onChange={setAmount} type="number" placeholder="₹0" />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={handleAdd} style={{ flex: 1 }}>Add</Btn>
            <Btn onClick={() => setShowAdd(false)} outline style={{ flex: 1 }}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{ marginBottom: 8, color: COLORS.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        💰 Money To Receive — {fmt(lend.reduce((s, p) => s + p.balance, 0))} total
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {lend.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 13, padding: "16px 0" }}>No pending receivables 🎉</div>
          : lend.map(p => <PersonCard key={p.id} p={p} />)}
      </div>

      <div style={{ marginBottom: 8, color: COLORS.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        💸 Money I Owe — {fmt(owe.reduce((s, p) => s + p.balance, 0))} total
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {owe.length === 0 ? <div style={{ color: COLORS.textMuted, fontSize: 13, padding: "16px 0" }}>You're debt free! 🎉</div>
          : owe.map(p => <PersonCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}

// BUDGET PLANNER
function BudgetPlanner({ budgets, categories, transactions, onSave }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(budgets);
  const txns = getMonthTxns(transactions, CUR_MONTH).filter(t => t.type === "expense");

  const getSpent = (catId) => txns.filter(t => t.categoryId === catId).reduce((s, t) => s + t.amount, 0);

  const handleSave = () => { onSave(local); setEditing(false); };

  const weeklyData = [
    { week: "W1", amount: 0 },
    { week: "W2", amount: 0 },
    { week: "W3", amount: 0 },
    { week: "W4", amount: 0 },
  ];

  txns.forEach(t => {
    if (!t.date) return;

    const day = new Date(t.date).getDate();

    if (day <= 7) weeklyData[0].amount += t.amount;
    else if (day <= 14) weeklyData[1].amount += t.amount;
    else if (day <= 21) weeklyData[2].amount += t.amount;
    else weeklyData[3].amount += t.amount;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text }}>📊 Budget Planner</div>
        <Btn onClick={() => editing ? handleSave() : setEditing(true)} style={{ padding: "8px 16px", fontSize: 12 }}>
          {editing ? "💾 Save" : "✏️ Edit"}
        </Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {local.map((b, i) => {
          const cat = categories.find(c => c.id === b.categoryId);
          const spent = getSpent(b.categoryId);
          const pct = b.limit ? (spent / b.limit) * 100 : 0;
          const warn = pct >= 80;
          return (
            <Card key={b.categoryId}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 20 }}>{cat?.icon || "💳"}</span>
                  <span style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>{cat?.name || b.categoryId}</span>
                  {warn && <Tag color={COLORS.warning}>⚠️ {Math.round(pct)}%</Tag>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {editing ? (
                    <input type="number" value={b.limit} onChange={e => {
                      const updated = [...local]; updated[i] = { ...b, limit: +e.target.value }; setLocal(updated);
                    }}
                      style={{ width: 80, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "4px 8px", color: COLORS.text, fontSize: 13, outline: "none" }} />
                  ) : (
                    <span style={{ color: COLORS.textMuted, fontSize: 12, fontFamily: "'DM Mono',monospace" }}>{fmt(b.limit)}</span>
                  )}
                </div>
              </div>
              <ProgressBar value={spent} max={b.limit} color={warn ? COLORS.warning : cat?.color || COLORS.accent} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ color: warn ? COLORS.warning : COLORS.textMuted, fontSize: 11 }}>Spent: {fmt(spent)}</span>
                <span style={{ color: COLORS.accent, fontSize: 11 }}>Left: {fmt(Math.max(0, b.limit - spent))}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Weekly bar chart */}
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>📅 Weekly Spending</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weeklyData}>
            <XAxis dataKey="week" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} width={50} tickFormatter={v => "₹" + v} />
            <Tooltip formatter={v => fmt(v)} contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }} />
            <Bar dataKey="amount" fill={COLORS.expense} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// GOALS & LIABILITIES
function GoalsScreen({ goals, liabilities, onAddGoal, onUpdateGoal }) {
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [gName, setGName] = useState("");
  const [gTarget, setGTarget] = useState("");
  const [gIcon, setGIcon] = useState("🎯");
  const [addSavings, setAddSavings] = useState({});

  const handleAddGoal = () => {
    if (!gName || !gTarget) return;
    onAddGoal({ id: uid(), name: gName, targetAmount: +gTarget, savedAmount: 0, icon: gIcon, color: PIE_COLORS[goals.length % PIE_COLORS.length] });
    setGName(""); setGTarget(""); setShowAddGoal(false);
  };

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text, marginBottom: 16 }}>🎯 Goals & Liabilities</div>

      {/* Goals */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Saving Goals</div>
        <Btn onClick={() => setShowAddGoal(v => !v)} style={{ padding: "5px 12px", fontSize: 11 }}>+ Goal</Btn>
      </div>

      {showAddGoal && (
        <Card style={{ marginBottom: 12 }}>
          <Input label="Goal Name" value={gName} onChange={setGName} placeholder="e.g. Emergency Fund" />
          <Input label="Target Amount" value={gTarget} onChange={setGTarget} type="number" placeholder="₹0" />
          <Input label="Icon (emoji)" value={gIcon} onChange={setGIcon} placeholder="🎯" />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={handleAddGoal} style={{ flex: 1 }}>Add Goal</Btn>
            <Btn onClick={() => setShowAddGoal(false)} outline style={{ flex: 1 }}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {goals.map(g => (
          <Card key={g.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>{g.icon}</span>
                <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>{g.name}</span>
              </div>
              <Tag color={g.color}>{Math.round((g.savedAmount / g.targetAmount) * 100)}%</Tag>
            </div>
            <ProgressBar value={g.savedAmount} max={g.targetAmount} color={g.color} height={10} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
              <span style={{ color: COLORS.textMuted, fontSize: 11 }}>{fmt(g.savedAmount)} of {fmt(g.targetAmount)}</span>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input type="number" placeholder="+ add" value={addSavings[g.id] || ""}
                  onChange={e => setAddSavings(s => ({ ...s, [g.id]: e.target.value }))}
                  style={{ width: 70, background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "4px 8px", color: COLORS.text, fontSize: 12, outline: "none" }} />
                <button onClick={() => {
                  if (!addSavings[g.id]) return;
                  onUpdateGoal(g.id, Math.min(g.targetAmount, g.savedAmount + +addSavings[g.id]));
                  setAddSavings(s => ({ ...s, [g.id]: "" }));
                }}
                  style={{ background: COLORS.accentDim, border: "none", borderRadius: 8, padding: "4px 10px", color: COLORS.accent, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                  Add
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Liabilities */}
      <div style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
        Liabilities
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {liabilities.map(l => (
          <Card key={l.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>🏦 {l.name}</div>
              <Tag color={COLORS.expense}>Due {l.dueDate}</Tag>
            </div>
            <ProgressBar value={l.paidAmount} max={l.totalAmount} color={COLORS.warning} height={10} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ color: COLORS.textMuted, fontSize: 11 }}>Paid: {fmt(l.paidAmount)}</span>
              <span style={{ color: COLORS.expense, fontSize: 11 }}>Remaining: {fmt(l.totalAmount - l.paidAmount)}</span>
            </div>
            {l.emi && <div style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 4 }}>EMI: {fmt(l.emi)}/month</div>}
          </Card>
        ))}
      </div>
    </div>
  );
}

// CATEGORIES
function CategoriesScreen({ categories, onAdd, onDelete }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("💡");
  const [color, setColor] = useState(PIE_COLORS[0]);

  const handleAdd = () => {
    if (!name) return;
    onAdd({ id: uid(), name, icon, color });
    setName(""); setShowAdd(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text }}>⚙️ Categories</div>
        <Btn onClick={() => setShowAdd(v => !v)} style={{ padding: "8px 16px", fontSize: 12 }}>+ Add</Btn>
      </div>

      {showAdd && (
        <Card style={{ marginBottom: 14 }}>
          <Input label="Name" value={name} onChange={setName} placeholder="Category name" />
          <Input label="Icon (emoji)" value={icon} onChange={setIcon} placeholder="💡" />
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Color</div>
            <div style={{ display: "flex", gap: 8 }}>
              {PIE_COLORS.map(c => (
                <div key={c} onClick={() => setColor(c)}
                  style={{ width: 28, height: 28, borderRadius: 14, background: c, cursor: "pointer", border: color === c ? "2px solid #fff" : "2px solid transparent" }} />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={handleAdd} style={{ flex: 1 }}>Add</Btn>
            <Btn onClick={() => setShowAdd(false)} outline style={{ flex: 1 }}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {categories.map(cat => (
          <Card key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: cat.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
              {cat.icon}
            </div>
            <div style={{ flex: 1, color: COLORS.text, fontWeight: 600, fontSize: 13 }}>{cat.name}</div>
            <button onClick={() => onDelete(cat.id)}
              style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 16, padding: "4px" }}>
              ✕
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function PocketLedger() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([
    { id: "food", name: "Food", icon: "🍔", color: "#FF8C5E" },
    { id: "travel", name: "Travel", icon: "🚗", color: "#7EB8FF" },
    { id: "shopping", name: "Shopping", icon: "🛍️", color: "#C07EFF" },
    { id: "salary", name: "Salary", icon: "💰", color: "#4FFFB0" },
  ]);
  const [people, setPeople] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTxn, setEditTxn] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // // Notification simulation
  // useEffect(() => {
  //   const now = new Date();
  //   if (now.getHours() === 20) {
  //     // Would fire notification at 8PM
  //   }
  // }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "users", user.uid, "transactions"),
      orderBy("date", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txnData = snapshot.docs.map(doc => {
        const data = doc.data();

        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate
            ? data.date.toDate().toISOString().split("T")[0]
            : data.date,
          isDeleted: data.isDeleted ?? false,
        };
      });

      setTransactions(txnData);
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const q = collection(db, "users", user.uid, "people");

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const peopleData = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));

      setPeople(peopleData);
    });

    return () => unsubscribe();
  }, [user]);

  const addPerson = async (personData) => {
    if (!user) return;

    try {
      await addDoc(
        collection(db, "users", user.uid, "people"),
        {
          ...personData,
          createdAt: serverTimestamp(),
        }
      );
    } catch (error) {
      console.error("Add Person Error:", error);
    }
  };

  const login = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      await setDoc(doc(db, "users", user.uid), {
        name: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: new Date(),
      }, { merge: true });

    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const addTransaction = async (txnData) => {
    if (!user) return;

    try {
      const docRef = await addDoc(
        collection(db, "users", user.uid, "transactions"),
        {
          ...txnData,
          createdAt: serverTimestamp(),
          isDeleted: false
        }
      );

      if (
        txnData.type === "expense" &&
        txnData.spendType === "other" &&
        txnData.personId
      ) {
        const personRef = doc(
          db,
          "users",
          user.uid,
          "people",
          txnData.personId
        );

        await updateDoc(personRef, {
          balance: increment(txnData.amount)
        });
      }

    } catch (error) {
      console.error("Add Transaction Error:", error);
    }
  };
  const deleteTransaction = async (id) => {
    if (!user) return;

    try {
      const txnRef = doc(db, "users", user.uid, "transactions", id);
      await updateDoc(txnRef, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
      });
      console.log("Deleting ID:", id);
    } catch (error) {
      console.error("Delete Error:", error);
    }
  };
  const restoreTransaction = async (id) => {
    if (!user) return;

    try {
      const txnRef = doc(db, "users", user.uid, "transactions", id);
      await updateDoc(txnRef, {
        isDeleted: false,
      });
    } catch (error) {
      console.error("Restore Error:", error);
    }
  };

  const markPersonPaid = async (id) => {
    if (!user) return;

    try {
      const ref = doc(db, "users", user.uid, "people", id);

      await updateDoc(ref, {
        balance: 0,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Mark Paid Error:", error);
    }
  };

  const TABS = [
    { id: "dashboard", label: "Home", icon: "🏠" },
    { id: "transactions", label: "Logs", icon: "📋" },
    { id: "add", label: "Add", icon: "➕" },
    { id: "dues", label: "Dues", icon: "🤝" },
    { id: "budget", label: "Budget", icon: "📊" },
  ];

  const DRAWER_ITEMS = [
    { id: "dashboard", icon: "🏠", label: "Dashboard" },
    { id: "transactions", icon: "📋", label: "Transactions" },
    { id: "dues", icon: "🤝", label: "Dues" },
    { id: "budget", icon: "📊", label: "Budget" },
    { id: "goals", icon: "🎯", label: "Goals" },
    { id: "categories", icon: "⚙️", label: "Categories" },
  ];

  const renderScreen = () => {
    switch (activeTab) {
      case "dashboard": return <Dashboard transactions={transactions} categories={categories} people={people} goals={goals} liabilities={liabilities} />;
      case "transactions": return <Transactions transactions={transactions} categories={categories} people={people}
        onDelete={deleteTransaction}
        onRestore={restoreTransaction}
        onEdit={t => { setEditTxn(t); setShowAddModal(true); }} />;
      case "dues":
        return <Dues people={people} onMarkPaid={markPersonPaid} onAddPerson={addPerson} />;
      case "budget": return <BudgetPlanner budgets={budgets} categories={categories} transactions={transactions} onSave={setBudgets} />;
      case "goals": return <GoalsScreen goals={goals} liabilities={liabilities}
        onAddGoal={g => setGoals(gs => [...gs, g])}
        onUpdateGoal={(id, saved) => setGoals(gs => gs.map(g => g.id === id ? { ...g, savedAmount: saved } : g))} />;
      case "categories": return <CategoriesScreen categories={categories}
        onAdd={c => setCategories(cs => [...cs, c])}
        onDelete={id => setCategories(cs => cs.filter(c => c.id !== id))} />;
      default: return null;
    }
  };

  if (loading) return <div>Loading...</div>;

  if (!user) {
    return (
      <div style={{ textAlign: "center", marginTop: "100px" }}>
        <h2>PocketLedger</h2>
        <button onClick={login}>Login with Google</button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "'Plus Jakarta Sans','Segoe UI',sans-serif", color: COLORS.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #2a3048; border-radius:2px; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
        select option { background: #161A23; }
      `}</style>

      <div>
        <img
          src={user.photoURL || "https://ui-avatars.com/api/?name=" + user.displayName}
          width="40"
          height="40"
          style={{ borderRadius: "50%", marginRight: 10, marginLeft: 20 }}
          alt="profile"
        />
        <span>{user.displayName}</span>
        <button onClick={logout}>Logout</button>
      </div>

      {/* Top Bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 100, background: COLORS.bg + "dd",
        backdropFilter: "blur(12px)", borderBottom: `1px solid ${COLORS.border}`,
        padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setDrawerOpen(v => !v)}
            style={{ background: "none", border: "none", color: COLORS.textSub, cursor: "pointer", fontSize: 20, padding: 4 }}>
            ☰
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg,${COLORS.accent},${COLORS.income})`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16
            }}>₹</div>
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>PocketLedger</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => { setEditTxn(null); setShowAddModal(true); }}
            style={{
              background: COLORS.accentDim, border: `1px solid ${COLORS.accent}44`, borderRadius: 10, padding: "7px 14px",
              color: COLORS.accent, fontWeight: 700, fontSize: 12, cursor: "pointer"
            }}>
            ➕ Add
          </button>
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }} onClick={() => setDrawerOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 260, background: COLORS.card, borderRight: `1px solid ${COLORS.border}`,
            padding: 24, display: "flex", flexDirection: "column", gap: 4
          }}>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg,${COLORS.accent},#2af)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>₹</div>
              PocketLedger
            </div>
            {DRAWER_ITEMS.map(item => (
              <button key={item.id} onClick={() => { setActiveTab(item.id); setDrawerOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12,
                  background: activeTab === item.id ? COLORS.accentDim : "transparent",
                  border: `1px solid ${activeTab === item.id ? COLORS.accent + "44" : "transparent"}`,
                  color: activeTab === item.id ? COLORS.accent : COLORS.textSub,
                  fontWeight: 600, fontSize: 14, cursor: "pointer", textAlign: "left"
                }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span> {item.label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginTop: 20 }}>
              Firebase sync enabled ☁️
            </div>
          </div>
          <div style={{ flex: 1, background: "rgba(0,0,0,0.5)" }} />
        </div>
      )}

      {/* Main Content */}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 16px 100px" }}>
        {renderScreen()}
      </div>

      {/* Bottom Tab Bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
        background: COLORS.card + "ee", backdropFilter: "blur(16px)",
        borderTop: `1px solid ${COLORS.border}`,
        display: "flex", padding: "8px 0 max(8px,env(safe-area-inset-bottom))"
      }}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const isAddBtn = tab.id === "add";
          return (
            <button key={tab.id}
              onClick={() => isAddBtn ? (setEditTxn(null), setShowAddModal(true)) : setActiveTab(tab.id)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                transition: "all 0.15s"
              }}>
              <div style={{
                fontSize: isAddBtn ? 28 : 20,
                width: isAddBtn ? 44 : 30, height: isAddBtn ? 44 : 30,
                borderRadius: isAddBtn ? 14 : 8,
                background: isAddBtn ? `linear-gradient(135deg,${COLORS.accent},#2af)` : active ? COLORS.accentDim : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: isAddBtn ? -4 : 0,
                boxShadow: isAddBtn ? `0 4px 20px ${COLORS.accent}66` : "none",
                border: active && !isAddBtn ? `1px solid ${COLORS.accent}44` : "none",
              }}>{tab.icon}</div>
              {!isAddBtn && <span style={{ fontSize: 10, fontWeight: 600, color: active ? COLORS.accent : COLORS.textMuted }}>{tab.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Add/Edit Transaction Modal */}
      {showAddModal && (
        <Modal title={editTxn ? "✏️ Edit Transaction" : "➕ New Transaction"} onClose={() => { setShowAddModal(false); setEditTxn(null); }}>
          <AddTransaction
            categories={categories} people={people}
            onAdd={addTransaction}
            editTxn={editTxn}
            onClose={() => { setShowAddModal(false); setEditTxn(null); }}
          />
        </Modal>
      )}
    </div>
  );
}
