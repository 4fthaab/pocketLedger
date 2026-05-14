import { useState, useEffect, useMemo } from "react";
import { PieChart, Pie, Cell, Area, XAxis, YAxis, Tooltip, LineChart, AreaChart, Line, ResponsiveContainer } from "recharts";
import { auth, db } from "./firebase";
import { Browser } from "@capacitor/browser";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc, setDoc, collection, addDoc, onSnapshot, query,
  orderBy, serverTimestamp, updateDoc, increment, deleteDoc
} from "firebase/firestore";
import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { motion, AnimatePresence } from "framer-motion";
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from 'capacitor-native-biometric';
import { LocalNotifications } from '@capacitor/local-notifications';

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
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
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

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ transactions, categories, people, goals, liabilities, currentMonth, onMonthChange }) {
  const displayDate = new Date(currentMonth + "-01").toLocaleString("default", { month: "long", year: "numeric" });

  // 1. THIS MONTH'S TRANSACTIONS (Resets to zero initially)
  const txns = getMonthTxns(transactions, currentMonth).filter(t => !t.isDeleted);
  // const income = txns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const income = txns
    .filter(t => t.type === "income" && !t.note?.includes("Transfer"))
    .reduce((s, t) => s + t.amount, 0);
  const expense = txns
    .filter(t => t.type === "expense" && !t.note?.includes("Transfer"))
    .reduce((s, t) => s + t.amount, 0);

  // 2. CUMULATIVE BALANCE (Carried over from previous months)
  const cumulativeTxns = transactions.filter(t => !t.isDeleted && t.date.slice(0, 7) <= currentMonth);
  const totalIncome = cumulativeTxns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = cumulativeTxns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const cumulativeBalance = totalIncome - totalExpense;

  // 3. NET WORTH CALCULATIONS
  const toReceive = people.filter(p => p.type === "lend").reduce((s, p) => s + p.balance, 0);
  const iOwe = people.filter(p => p.type === "owe").reduce((s, p) => s + p.balance, 0);
  const liabilityTotal = liabilities.reduce((s, l) => s + (l.totalAmount - l.paidAmount), 0);
  const netWorth = cumulativeBalance + toReceive - iOwe - liabilityTotal;

  const [showFullChartModal, setShowFullChartModal] = useState(false);

  const handleMonthChange = (offset) => {
    const [year, month] = currentMonth.split("-").map(Number);
    const date = new Date(year, (month - 1) + offset, 1);
    const nextYear = date.getFullYear();
    const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
    onMonthChange(`${nextYear}-${nextMonth}`);
  };

  const catSpend = {};
  txns.filter(t => t.type === "expense" && !t.note?.includes("Transfer")).forEach(t => {
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

    // Calculate cumulative balance up to THIS specific day
    const historicalTxns = transactions.filter(t => !t.isDeleted && t.date <= key);
    const dailyBalance = historicalTxns.reduce((s, t) => t.type === "income" ? s + t.amount : s - t.amount, 0);

    lineData.push({
      day: key.slice(-2), // Shows the date (e.g., "12")
      balance: dailyBalance,
    });
  }

  const fullMonthLineData = [];
  const [year, month] = currentMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  // 1. Calculate the starting point (Closing balance of all previous months)
  const prevTxns = transactions.filter(t => !t.isDeleted && t.date.slice(0, 7) < currentMonth);
  let runningTotal = prevTxns.reduce((s, t) => t.type === "income" ? s + t.amount : s - t.amount, 0);

  // 2. Add "Day 0" as the baseline (Previous Month Closing)
  fullMonthLineData.push({
    day: "00",
    fullDate: "Previous Month Closing",
    balance: runningTotal,
  });

  // 3. Loop through each day of the current month
  for (let i = 1; i <= daysInMonth; i++) {
    const dayString = String(i).padStart(2, '0');
    const key = `${currentMonth}-${dayString}`;

    const dayTxns = txns.filter(t => t.date === key);
    const dayIncome = dayTxns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const dayExpense = dayTxns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

    runningTotal += (dayIncome - dayExpense);

    fullMonthLineData.push({
      day: dayString,
      fullDate: key,
      balance: runningTotal,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ color: COLORS.textMuted, fontSize: 12 }}>Financial Overview</div>
          <div style={{ color: COLORS.text, fontWeight: 800, fontSize: 22 }}>Dashboard</div>
        </div>

        {/* Navigation UI */}
        <div style={{ display: "flex", alignItems: "center", background: COLORS.card, borderRadius: 12, border: `1px solid ${COLORS.border}`, padding: "4px" }}>
          <button
            onClick={() => handleMonthChange(-1)}
            style={{ background: "none", border: "none", color: COLORS.accent, padding: "8px 12px", cursor: "pointer", fontWeight: "bold" }}
          >
            ←
          </button>
          <span style={{ color: COLORS.text, fontSize: 13, fontWeight: 700, padding: "0 8px", minWidth: 110, textAlign: "center" }}>
            {displayDate}
          </span>
          <button
            onClick={() => handleMonthChange(1)}
            style={{ background: "none", border: "none", color: COLORS.accent, padding: "8px 12px", cursor: "pointer", fontWeight: "bold" }}
          >
            →
          </button>
        </div>
      </div>

      {/* --- SUMMARY CARDS --- */}
      <div
        className="summary-grid"
        style={{
          display: "grid",
          gap: 14,
          marginBottom: 16
        }}
      >
        {/* INCOME */}
        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>INCOME</div>
          <div style={{ color: COLORS.income, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>
            {fmt(income)}
          </div>
        </Card>

        {/* EXPENSE */}
        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>EXPENSE</div>
          <div style={{ color: COLORS.expense, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>
            {fmt(expense)}
          </div>
        </Card>

        {/* TOTAL BALANCE */}
        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", border: `1px solid ${COLORS.accent}33` }}>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>TOTAL BALANCE</div>
          <div style={{ color: cumulativeBalance >= 0 ? COLORS.income : COLORS.expense, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>
            {fmt(cumulativeBalance)}
          </div>
          <div style={{ color: COLORS.textSub, fontSize: 9, marginTop: 4 }}>Carried over</div>
        </Card>
        {/* NET WORTH */}
        <Card
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            background: netWorth >= 0
              ? `linear-gradient(135deg, ${COLORS.card}, ${COLORS.accent}05)`
              : COLORS.card,
            border: `1px solid ${netWorth >= 0 ? COLORS.income + "44" : COLORS.expense + "44"}`
          }}
        >
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>NET WORTH</div>
          <div style={{ color: netWorth >= 0 ? COLORS.income : COLORS.expense, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>
            {fmt(netWorth)}
          </div>
        </Card>

        {/* TO RECEIVE */}
        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>TO RECEIVE</div>
          <div style={{ color: COLORS.pending, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>
            {fmt(toReceive)}
          </div>
        </Card>

        {/* I OWE */}
        <Card style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, marginBottom: 4 }}>I OWE</div>
          <div style={{ color: COLORS.expense, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>
            {fmt(iOwe)}
          </div>
        </Card>
      </div>


      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>🍕 By Category</div>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={55}
                    innerRadius={28}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(v) => fmt(v)}
                    contentStyle={{
                      background: COLORS.card,       // Matches your card background (#161A23)
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: "12px",
                      padding: "8px 12px",
                      boxShadow: "0 10px 20px rgba(0,0,0,0.4)"
                    }}
                    itemStyle={{
                      color: COLORS.text,            // White/Light text (#F0F4FF)
                      fontSize: "14px",
                      fontWeight: "600"
                    }}
                    // This removes the default "square" icon color if you want a cleaner look
                    iconType="circle"
                  />
                  {/* <Tooltip formatter={v => fmt(v)} contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }} /> */}
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 4 }}>
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

        <Card onClick={() => setShowFullChartModal(true)}>
          <div style={{ fontWeight: 700, color: COLORS.text, marginBottom: 12 }}>📈 Balance Trend (Last 7 Days)</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={lineData}>
              <defs>
                <linearGradient id="colorBalPreview" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: COLORS.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                formatter={v => fmt(v)}
                contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text }}
                itemStyle={{ color: COLORS.accent }}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke={COLORS.accent}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorBalPreview)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

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
      {/* ADD THIS MODAL AT THE END OF THE DASHBOARD RETURN */}
      {showFullChartModal && (
        <Modal title={`Cash Flow: ${displayDate}`} onClose={() => setShowFullChartModal(false)}>
          {/* Scrollable Container */}
          <div style={{
            width: "100%",
            overflowX: "auto",
            overflowY: "hidden",
            paddingBottom: 10
          }}>
            {/* The inner div is forced to be wider than the screen to create scrolling */}
            <div style={{ width: Math.max(600, daysInMonth * 35), height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={fullMonthLineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.accent} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="day"
                    tick={{ fill: COLORS.textMuted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    hide={false}
                    domain={['auto', 'auto']}
                    tick={{ fill: COLORS.textMuted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={70}
                    tickFormatter={v => "₹" + v.toLocaleString('en-IN')}
                  />
                  <Tooltip
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
                    formatter={v => [fmt(v), "Balance"]}
                    contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, color: COLORS.text }}
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={COLORS.accent}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorBal)"
                    connectNulls
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── ADD TRANSACTION ──────────────────────────────────────────────────────────
function AddTransaction({ categories, people, onAdd, onAddPerson, onClose, editTxn, accounts }) {
  const [type, setType] = useState(editTxn?.type || "expense");
  const [amount, setAmount] = useState(editTxn?.amount?.toString() || "");
  const [categoryId, setCategoryId] = useState(editTxn?.categoryId || categories[0]?.id || "");
  const [note, setNote] = useState(editTxn?.note || "");
  const [date, setDate] = useState(editTxn?.date || new Date().toISOString().split("T")[0]);
  const [spendType, setSpendType] = useState(editTxn?.spendType || "self");
  const [personId, setPersonId] = useState(editTxn?.personId || "");
  const [newPersonName, setNewPersonName] = useState("");
  const [isRecurring, setIsRecurring] = useState(editTxn?.isRecurring || false);

  // Account States
  const [accountId, setAccountId] = useState(editTxn?.accountId || accounts[0]?.id || "");
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id || accounts[0]?.id || "");

  const allCats = categories;

  const handleSubmit = async () => {
    if (!amount || isNaN(+amount)) return;

    // --- TRANSFER LOGIC ---
    if (type === "transfer") {
      if (accountId === toAccountId) return;

      const fromAcc = accounts.find(a => a.id === accountId);
      const toAcc = accounts.find(a => a.id === toAccountId);

      // 1. Out Transaction (Expense from source) - RECORDED FIRST
      await onAdd({
        type: "expense",
        amount: +amount,
        categoryId,
        accountId: accountId,
        note: note ? `Transfer to ${toAcc?.name} (${note})` : `Transfer to ${toAcc?.name}`,
        date,
        spendType: "self",
        personId: null,
        isRecurring: false,
      });

      // ⏳ Force a 500ms delay so Firebase timestamps them sequentially
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. In Transaction (Income to destination) - RECORDED SECOND
      await onAdd({
        type: "income",
        amount: +amount,
        categoryId,
        accountId: toAccountId,
        note: note ? `Transfer from ${fromAcc?.name} (${note})` : `Transfer from ${fromAcc?.name}`,
        date,
        spendType: "self",
        personId: null,
        isRecurring: false,
      });

      onClose?.();
      return;
    }

    // --- NORMAL EXPENSE/INCOME LOGIC ---
    let finalPersonId = personId;

    if (spendType === "other" && personId === "NEW" && newPersonName) {
      finalPersonId = await onAddPerson({ name: newPersonName, balance: 0, type: "lend" });
    }

    onAdd({
      ...(editTxn?.id && { id: editTxn.id }),
      type,
      amount: +amount,
      categoryId,
      accountId,
      note,
      date,
      spendType,
      personId: spendType === "other" ? finalPersonId : null,
      isRecurring,
    });
    onClose?.();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Type Toggle */}
      <Toggle value={type} onChange={setType} options={
        editTxn ? [
          { value: "expense", label: "💸 Expense", color: COLORS.expense },
          { value: "income", label: "💰 Income", color: COLORS.income }
        ] : [
          { value: "expense", label: "💸 Expense", color: COLORS.expense },
          { value: "income", label: "💰 Income", color: COLORS.income },
          { value: "transfer", label: "🔄 Transfer", color: COLORS.pending }
        ]
      } />

      <Input label="Amount (₹)" value={amount} onChange={setAmount} type="number" placeholder="0" />

      {/* ACCOUNT SELECTION UI */}
      {type === "transfer" ? (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>From Account (Out)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {accounts.map(acc => (
                <button key={acc.id} onClick={() => setAccountId(acc.id)}
                  style={{
                    background: accountId === acc.id ? acc.color + "33" : COLORS.bg,
                    border: accountId === acc.id ? `1.5px solid ${acc.color}` : `1px solid ${COLORS.border}`,
                    borderRadius: 10, padding: "6px 12px", color: accountId === acc.id ? acc.color : COLORS.textMuted,
                    fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "all 0.15s"
                  }}
                >{acc.icon} {acc.name}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>To Account (In)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {accounts.map(acc => {
                const isFromAccount = acc.id === accountId;
                return (
                  <button key={acc.id}
                    onClick={() => !isFromAccount && setToAccountId(acc.id)}
                    disabled={isFromAccount}
                    style={{
                      background: toAccountId === acc.id ? acc.color + "33" : COLORS.bg,
                      border: toAccountId === acc.id ? `1.5px solid ${acc.color}` : `1px solid ${COLORS.border}`,
                      borderRadius: 10, padding: "6px 12px",
                      color: toAccountId === acc.id ? acc.color : COLORS.textMuted,
                      fontSize: 12, fontWeight: 600, transition: "all 0.15s",
                      opacity: isFromAccount ? 0.3 : 1,
                      cursor: isFromAccount ? "not-allowed" : "pointer",
                      filter: isFromAccount ? "grayscale(1)" : "none"
                    }}
                  >{acc.icon} {acc.name}</button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Account / Bank</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {accounts.map(acc => (
              <button key={acc.id} onClick={() => setAccountId(acc.id)}
                style={{
                  background: accountId === acc.id ? acc.color + "33" : COLORS.bg,
                  border: accountId === acc.id ? `1.5px solid ${acc.color}` : `1px solid ${COLORS.border}`,
                  borderRadius: 10, padding: "6px 12px", color: accountId === acc.id ? acc.color : COLORS.textMuted,
                  fontSize: 12, cursor: "pointer", fontWeight: 600, transition: "all 0.15s"
                }}
              >{acc.icon} {acc.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Category Selection */}
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

      {/* Spend Type Logic */}
      {type !== "transfer" && (
        <>
          <Toggle value={spendType} onChange={setSpendType} options={[
            { value: "self", label: "👤 Myself" },
            { value: "other", label: "👥 For Someone" }
          ]} />

          {spendType === "other" && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Person</div>
              <select
                value={personId}
                onChange={e => setPersonId(e.target.value)}
                style={{
                  width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                  borderRadius: 10, padding: "10px 14px", color: COLORS.text,
                  fontSize: 14, outline: "none", marginBottom: personId === "NEW" ? 8 : 0
                }}
              >
                <option value="">Select person...</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="NEW">+ Add New Person</option>
              </select>

              {personId === "NEW" && (
                <Input
                  placeholder="Enter their name..."
                  value={newPersonName}
                  onChange={setNewPersonName}
                />
              )}
            </div>
          )}
        </>
      )}

      <Input label="Note" value={note} onChange={setNote} placeholder="Optional note..." />
      <Input label="Date" value={date} onChange={setDate} type="date" />

      {/* Recurring Option */}
      {type !== "transfer" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <button onClick={() => setIsRecurring(v => !v)}
            style={{ width: 36, height: 20, borderRadius: 10, background: isRecurring ? COLORS.accent : COLORS.border, border: "none", cursor: "pointer", transition: "background 0.15s", position: "relative" }}>
            <div style={{ position: "absolute", top: 2, left: isRecurring ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: "#fff", transition: "left 0.15s" }} />
          </button>
          <span style={{ color: COLORS.textSub, fontSize: 13 }}>Recurring expense</span>
        </div>
      )}

      <Btn onClick={handleSubmit} style={{ width: "100%", padding: "12px 0" }}>
        {editTxn ? "💾 Update Transaction" : (type === "transfer" ? "🔄 Add Transfer" : "➕ Add Transaction")}
      </Btn>
    </div>
  );
}
// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────
function Transactions({ transactions, categories, people, accounts, onDelete, onEdit, onRestore, currentMonth }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      // 1. Month Filter (Only show transactions matching currentMonth)
      if (t.date) {
        const tMonth = t.date.slice(0, 7); // Extracts "YYYY-MM"
        if (tMonth !== currentMonth) return false;
      }

      // 2. Trash Filter
      if (showDeleted ? !t.isDeleted : t.isDeleted) return false;

      // 3. Type Filter
      if (filterType !== "all" && t.type !== filterType) return false;

      // 4. Category Filter
      if (filterCat !== "all" && t.categoryId !== filterCat) return false;

      // 5. Search Filter
      const cat = categories.find(c => c.id === t.categoryId);
      const person = t.personId ? people.find(p => p.id === t.personId) : null;
      const acc = accounts?.find(a => a.id === t.accountId); // Fixed: accountID -> accountId

      // Added acc?.name so you can search by Bank name too!
      const searchStr = `${t.note} ${cat?.name || ""} ${person?.name || ""} ${acc?.name || ""}`.toLowerCase();
      if (search && !searchStr.includes(search.toLowerCase())) return false;

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);

      // Primary Sort: By Date (Newest first)
      if (dateB > dateA) return 1;
      if (dateB < dateA) return -1;

      // Secondary Sort: By order of creation (Newest first)
      // This ensures items added on the same day stay in exact chronological order
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });
  }, [transactions, search, filterType, filterCat, showDeleted, categories, people, accounts, currentMonth]); // Added accounts to dependencies

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text }}>📋 Transactions</div>
        <div style={{ color: COLORS.accent, fontSize: 13, fontWeight: 700, background: COLORS.accentDim, padding: "4px 12px", borderRadius: 8 }}>
          {new Date(currentMonth + "-01").toLocaleString("default", { month: "short", year: "numeric" })}
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search (e.g., Food, Federal Bank)..."
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

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", color: COLORS.textMuted, padding: "40px 0", fontSize: 14 }}>No transactions found</div>
        )}
        {filtered.map(t => {
          const cat = categories.find(c => c.id === t.categoryId);
          const person = t.personId ? people.find(p => p.id === t.personId) : null;
          const acc = accounts?.find(a => a.id === t.accountId);

          return (
            <Card key={t.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", opacity: t.isDeleted ? 0.5 : 1 }}>
              <div style={{ fontSize: 26 }}>{cat?.icon || "💳"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ color: COLORS.text, fontWeight: 600, fontSize: 14 }}>{t.note || cat?.name || "—"}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <Tag color={cat?.color || COLORS.accent}>{cat?.name || "—"}</Tag>
                  {acc && <Tag color={acc.color || COLORS.textMuted}>{acc.icon} {acc.name}</Tag>}
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

// ─── DUES ─────────────────────────────────────────────────────────────────────
function Dues({ people, onMarkPaid, onAddPerson }) {
  const lend = people.filter(p => p.type === "lend" && p.balance > 0);
  const owe = people.filter(p => p.type === "owe" && p.balance > 0);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueType, setDueType] = useState("lend");

  const handleAdd = () => {
    if (!name || !amount) return;
    onAddPerson({ name, balance: +amount, type: dueType });
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
        {/* <Btn onClick={() => setShowAdd(true)} style={{ padding: "8px 16px", fontSize: 12 }}>+ Add</Btn> */}
      </div>

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

// ─── BALANCES (REPLACES BUDGET) ────────────────────────────────────────────────
function BalancesScreen({ accounts, transactions, currentMonth }) {

  // Calculate cumulative balance up to the end of the currently selected month
  const getAccountBalance = (accountId) => {
    const validTxns = transactions.filter(t => {
      if (t.isDeleted) return false;
      const tMonth = t.date.slice(0, 7); // "YYYY-MM"
      return tMonth <= currentMonth;     // Only include transactions up to selected month
    });

    const accTxns = validTxns.filter(t => t.accountId === accountId);
    const income = accTxns.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const expense = accTxns.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    return income - expense;
  };

  const totalLiquidity = accounts.reduce((sum, acc) => sum + getAccountBalance(acc.id), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text }}>💳 Accounts & Balances</div>
        <div style={{ color: COLORS.accent, fontSize: 13, fontWeight: 700, background: COLORS.accentDim, padding: "4px 12px", borderRadius: 8 }}>
          {new Date(currentMonth + "-01").toLocaleString("default", { month: "short", year: "numeric" })}
        </div>
      </div>

      <Card style={{ marginBottom: 20, textAlign: "center", padding: "24px 20px" }}>
        <div style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Total Liquid Funds</div>
        <div style={{ color: totalLiquidity >= 0 ? COLORS.income : COLORS.expense, fontWeight: 800, fontSize: 32, fontFamily: "'DM Mono',monospace" }}>
          {fmt(totalLiquidity)}
        </div>
        <div style={{ color: COLORS.textSub, fontSize: 12, marginTop: 8 }}>
          Cumulative balance up to end of {new Date(currentMonth + "-01").toLocaleString("default", { month: "long" })}
        </div>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {accounts.map(acc => {
          const balance = getAccountBalance(acc.id);
          return (
            <Card key={acc.id} style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, background: acc.color + "22",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24
              }}>
                {acc.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 16 }}>{acc.name}</div>
                <div style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 2 }}>{acc.id === "cash" ? "Physical wallet" : "Bank account"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: balance >= 0 ? COLORS.text : COLORS.expense, fontWeight: 800, fontSize: 18, fontFamily: "'DM Mono',monospace" }}>
                  {fmt(balance)}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── GOALS & LIABILITIES (UPDATED) ───────────────────────────────────────────
function GoalsScreen({ goals, liabilities, onAddGoal, onUpdateGoal, onDeleteGoal, onAddLiability, onUpdateLiability, onDeleteLiability }) {
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showAddLiab, setShowAddLiab] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // Tracks if we are editing

  // Goal Form State
  const [gName, setGName] = useState("");
  const [gTarget, setGTarget] = useState("");
  const [gIcon, setGIcon] = useState("🎯");
  const [addSavings, setAddSavings] = useState({});

  // Liability Form State
  const [lName, setLName] = useState("");
  const [lTotal, setLTotal] = useState("");
  const [lPaid, setLPaid] = useState("");
  const [lDue, setLDue] = useState("");
  const [lEmi, setLEmi] = useState("");

  useEffect(() => {
    if (lTotal && lDue) {
      const remaining = (+lTotal) - (+lPaid || 0);
      const today = new Date();
      const dueDate = new Date(lDue);

      // Calculate month difference
      const months = (dueDate.getFullYear() - today.getFullYear()) * 12 + (dueDate.getMonth() - today.getMonth());

      if (months > 0) {
        setLEmi(Math.round(remaining / months));
      } else {
        setLEmi(remaining); // Due this month or overdue
      }
    }
  }, [lTotal, lPaid, lDue]);

  const handleAddGoal = () => {
    if (!gName.trim() || !gTarget || gTarget <= 0) {
      alert("Please enter a valid name and target amount.");
      return;
    }
    onAddGoal({
      id: editingItem?.id || uid(),
      name: gName,
      targetAmount: +gTarget,
      savedAmount: editingItem?.savedAmount || 0,
      icon: gIcon,
      color: PIE_COLORS[goals.length % PIE_COLORS.length]
    });
    resetGoalForm();
  };

  const handleAddLiability = () => {
    if (!lName.trim() || !lTotal || lTotal <= 0) {
      alert("Please enter a valid name and total amount.");
      return;
    }
    onAddLiability({
      id: editingItem?.id || uid(),
      name: lName,
      totalAmount: +lTotal,
      paidAmount: +lPaid || 0,
      dueDate: lDue || "N/A",
      emi: +lEmi || 0
    });
    resetLiabForm();
  };

  const resetGoalForm = () => {
    setGName(""); setGTarget(""); setGIcon("🎯"); setShowAddGoal(false); setEditingItem(null);
  };

  const resetLiabForm = () => {
    setLName(""); setLTotal(""); setLPaid(""); setLDue(""); setLEmi(""); setShowAddLiab(false); setEditingItem(null);
  };

  const startEditGoal = (g) => {
    setEditingItem(g); setGName(g.name); setGTarget(g.targetAmount); setGIcon(g.icon); setShowAddGoal(true);
  };

  const startEditLiab = (l) => {
    setEditingItem(l); setLName(l.name); setLTotal(l.totalAmount); setLPaid(l.paidAmount); setLDue(l.dueDate); setLEmi(l.emi); setShowAddLiab(true);
  };

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text, marginBottom: 16 }}>🎯 Goals & Liabilities</div>

      {/* --- SAVING GOALS SECTION --- */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Saving Goals</div>
        <Btn onClick={() => setShowAddGoal(true)} style={{ padding: "5px 12px", fontSize: 11 }}>+ Goal</Btn>
      </div>

      {showAddGoal && (
        <Card style={{ marginBottom: 16, border: `1px solid ${COLORS.accent}44` }}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: COLORS.accent }}>{editingItem ? "Edit Goal" : "New Saving Goal"}</div>
          <Input label="Goal Name *" value={gName} onChange={setGName} placeholder="e.g. New Car" />
          <Input label="Target Amount (₹) *" value={gTarget} onChange={setGTarget} type="number" placeholder="0" />
          <Input label="Icon (emoji)" value={gIcon} onChange={setGIcon} placeholder="🎯" />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={handleAddGoal} style={{ flex: 1 }}>{editingItem ? "Update" : "Add Goal"}</Btn>
            <Btn onClick={resetGoalForm} outline style={{ flex: 1 }}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
        {goals.map(g => (
          <Card key={g.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 22 }}>{g.icon}</span>
                <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>{g.name}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => startEditGoal(g)} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 14 }}>✏️</button>
                <button onClick={() => onDeleteGoal(g.id)} style={{ background: "none", border: "none", color: COLORS.expense, cursor: "pointer", fontSize: 14 }}>🗑️</button>
              </div>
            </div>

            <ProgressBar value={g.savedAmount} max={g.targetAmount} color={g.color} height={10} />

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{fmt(g.savedAmount)} / {fmt(g.targetAmount)} ({Math.round((g.savedAmount / g.targetAmount) * 100)}%)</span>

              {/* LARGER ADD MONEY UI */}
              <div style={{ display: "flex", gap: 6, flex: "1 1 150px", justifyContent: "flex-end" }}>
                <input
                  type="number"
                  placeholder="+ amount"
                  value={addSavings[g.id] || ""}
                  onChange={e => setAddSavings(s => ({ ...s, [g.id]: e.target.value }))}
                  style={{
                    flex: 1, maxWidth: 100, background: COLORS.bg, border: `1px solid ${COLORS.border}`,
                    borderRadius: 10, padding: "8px 12px", color: COLORS.text, fontSize: 14, outline: "none"
                  }}
                />
                <button
                  onClick={() => {
                    if (!addSavings[g.id]) return;
                    onUpdateGoal(g.id, Math.min(g.targetAmount, g.savedAmount + +addSavings[g.id]));
                    setAddSavings(s => ({ ...s, [g.id]: "" }));
                  }}
                  style={{ background: COLORS.accent, border: "none", borderRadius: 10, padding: "8px 16px", color: "#000", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                  Add
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* --- LIABILITIES SECTION --- */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Liabilities (Loans/EMI)</div>
        <Btn onClick={() => setShowAddLiab(true)} style={{ padding: "5px 12px", fontSize: 11 }}>+ Debt</Btn>
      </div>

      {showAddLiab && (
        <Card style={{ marginBottom: 16, border: `1px solid ${COLORS.expense}44` }}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: COLORS.expense }}>
            {editingItem ? "Edit Liability" : "New Liability"}
          </div>
          <Input label="Lender Name *" value={lName} onChange={setLName} placeholder="e.g. Home Loan" />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Total Amount *" value={lTotal} onChange={setLTotal} type="number" placeholder="0" />
            <Input label="Already Paid" value={lPaid} onChange={setLPaid} type="number" placeholder="0" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Input label="Final Due Date *" value={lDue} onChange={setLDue} type="date" />
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
                Auto-calculated EMI
              </div>
              <div style={{
                background: COLORS.bg, padding: "10px 14px", borderRadius: 10,
                color: COLORS.accent, fontWeight: 700, border: `1px solid ${COLORS.border}`
              }}>
                {fmt(lEmi)}/mo
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={handleAddLiability} color={COLORS.expense} style={{ flex: 1, color: "#fff" }}>
              {editingItem ? "Update Liability" : "Add Liability"}
            </Btn>
            <Btn onClick={resetLiabForm} outline style={{ flex: 1 }}>Cancel</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {liabilities.map(l => (
          <Card key={l.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ color: COLORS.text, fontWeight: 700, fontSize: 14 }}>🏦 {l.name}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Tag color={COLORS.expense}>Due: {l.dueDate}</Tag>
                <button onClick={() => startEditLiab(l)} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 14 }}>✏️</button>
                <button onClick={() => onDeleteLiability(l.id)} style={{ background: "none", border: "none", color: COLORS.expense, cursor: "pointer", fontSize: 14 }}>🗑️</button>
              </div>
            </div>

            <ProgressBar value={l.paidAmount} max={l.totalAmount} color={COLORS.warning} height={10} />

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12 }}>
              <span style={{ color: COLORS.textMuted }}>Paid: {fmt(l.paidAmount)}</span>
              <span style={{ color: COLORS.expense, fontWeight: 700 }}>Rem: {fmt(l.totalAmount - l.paidAmount)}</span>
            </div>

            {l.emi > 0 && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: COLORS.bg, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: COLORS.textMuted, fontSize: 11 }}>Monthly EMI:</span>
                <span style={{ color: COLORS.text, fontWeight: 600, fontSize: 13 }}>{fmt(l.emi)}</span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── CONFIRM MODAL ────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)"
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: COLORS.card, borderRadius: 28, border: `1px solid ${COLORS.border}`,
        padding: "32px 24px", width: "100%", maxWidth: 340, textAlign: "center",
        boxShadow: "0 24px 48px rgba(0,0,0,0.6)"
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, background: COLORS.expenseDim,
          color: COLORS.expense, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32, margin: "0 auto 20px"
        }}>⚠️</div>
        <div style={{ fontWeight: 800, fontSize: 20, color: COLORS.text, marginBottom: 8 }}>{title}</div>
        <div style={{ color: COLORS.textMuted, fontSize: 14, marginBottom: 28, lineHeight: "1.5" }}>{message}</div>
        <div style={{ display: "flex", gap: 12 }}>
          <Btn onClick={onConfirm} style={{ flex: 1, background: COLORS.expense, color: "#fff" }}>Delete</Btn>
          <Btn onClick={onCancel} outline style={{ flex: 1, color: COLORS.textMuted, border: `1px solid ${COLORS.border}` }}>Cancel</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
function CategoriesScreen({ categories, onAdd, onDelete }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("💡");
  const [color, setColor] = useState(PIE_COLORS[0]);
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      // We pass the data to the parent function (saveCategory) 
      // which now handles the Firebase setDoc logic
      await onAdd({
        id: uid(),
        name: name.trim(),
        icon,
        color
      });

      // Reset form only on success
      setName("");
      setShowAdd(false);
    } catch (error) {
      alert("Failed to save category. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text }}>⚙️ Categories</div>
        <Btn onClick={() => setShowAdd(v => !v)} style={{ padding: "8px 16px", fontSize: 12 }}>
          {showAdd ? "Close" : "+ Add"}
        </Btn>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <Card style={{ marginBottom: 14, border: `1px solid ${COLORS.accent}33` }}>
              <Input label="Category Name" value={name} onChange={setName} placeholder="e.g., Entertainment" />
              <Input label="Icon (emoji)" value={icon} onChange={setIcon} placeholder="💡" />

              <div style={{ marginBottom: 14 }}>
                <div style={{ color: COLORS.textMuted, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                  Theme Color
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {PIE_COLORS.map(c => (
                    <div
                      key={c}
                      onClick={() => setColor(c)}
                      style={{
                        width: 32, height: 32, borderRadius: 10, background: c,
                        cursor: "pointer", border: color === c ? "2px solid #fff" : "2px solid transparent",
                        transition: "transform 0.1s"
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"}
                      onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={handleAdd} style={{ flex: 1 }} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Add Category"}
                </Btn>
                <Btn onClick={() => setShowAdd(false)} outline style={{ flex: 1 }}>Cancel</Btn>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {categories.map(cat => (
          <Card key={cat.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, background: cat.color + "22",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22
            }}>
              {cat.icon}
            </div>
            <div style={{ flex: 1, color: COLORS.text, fontWeight: 600, fontSize: 14 }}>{cat.name}</div>
            <button
              onClick={() => onDelete(cat.id)}
              style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", fontSize: 18, padding: "4px" }}
            >
              ✕
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── SHEET EXPORT SCREEN ──────────────────────────────────────────────────────
function SheetScreen({ transactions, categories, accounts, currentMonth, onMonthChange }) {

  const displayDate = new Date(currentMonth + "-01").toLocaleString("default", { month: "long", year: "numeric" });

  const handleMonthChange = (offset) => {
    const [year, month] = currentMonth.split("-").map(Number);
    const date = new Date(year, (month - 1) + offset, 1);
    const nextYear = date.getFullYear();
    const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
    onMonthChange(`${nextYear}-${nextMonth}`);
  };

  // 1. Build Data Structure (Opening Balances + Sorted Transactions)
  const ledgerData = useMemo(() => {

    // Step A: Sort transactions by Date, then by the exact time they were added
    const sortedTxns = [...transactions]
      .filter(t => !t.isDeleted)
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);

        // 1. Primary Sort: By the user-selected Date
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;

        // 2. Secondary Sort: By order of creation (the actual time you added it)
        // This ensures your Federal -> SBI transfer stays in the order you typed it.
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeA - timeB;
      });

    // Step B: Calculate Opening Balances (Historical carryover)
    let prevAccounts = {};
    accounts.forEach(a => prevAccounts[a.id] = 0);
    const currentMonthTxns = [];

    sortedTxns.forEach(t => {
      const tMonth = t.date.slice(0, 7);
      if (tMonth < currentMonth) {
        if (t.type === "income" && t.accountId) prevAccounts[t.accountId] += t.amount;
        if (t.type === "expense" && t.accountId) prevAccounts[t.accountId] -= t.amount;
      } else if (tMonth === currentMonth) {
        currentMonthTxns.push(t);
      }
    });

    // Step C: Build the Month Display
    const displayData = [];
    let runTotal = 0;
    let runAccounts = {};
    accounts.forEach(a => runAccounts[a.id] = 0);

    // 1st: Inject Opening Balances row-by-row
    accounts.forEach(acc => {
      const openBal = prevAccounts[acc.id] || 0;
      runTotal += openBal;
      runAccounts[acc.id] = openBal;

      displayData.push({
        id: `open-${acc.id}`,
        date: `${currentMonth}-01`,
        note: `Opening balance ${acc.name}`,
        accountId: acc.id,
        type: "opening",
        amount: openBal,
        runTotal: runTotal,
        runAccounts: { ...runAccounts }
      });
    });

    // 2nd: Process this month's transactions in EXACT entry order
    currentMonthTxns.forEach(t => {
      if (t.type === "income") {
        runTotal += t.amount;
        if (t.accountId) runAccounts[t.accountId] += t.amount;
      } else if (t.type === "expense") {
        runTotal -= t.amount;
        if (t.accountId) runAccounts[t.accountId] -= t.amount;
      }

      displayData.push({
        ...t,
        runTotal: runTotal,
        runAccounts: { ...runAccounts }
      });
    });

    return displayData;
  }, [transactions, accounts, currentMonth]);

  // 2. Export to Excel Function
  const exportToExcel = async () => {
    try {
      const exportData = ledgerData.map(row => {
        const cat = categories.find(c => c.id === row.categoryId);
        const acc = accounts.find(a => a.id === row.accountId);

        // Determine if amount goes in the "In" or "Out" column
        let inVal = "";
        let outVal = "";

        if (row.type === "income" || (row.type === "opening" && row.amount >= 0)) {
          inVal = Math.abs(row.amount);
        } else if (row.type === "expense" || (row.type === "opening" && row.amount < 0)) {
          outVal = Math.abs(row.amount);
        }

        const rowData = {
          Date: row.date,
          Info: row.note || cat?.name || "Transaction",
          Account: acc?.name || "—",
          In: inVal,
          Out: outVal,
          "Total Bal": row.runTotal,
        };

        // Dynamically add a column for every bank
        accounts.forEach(a => {
          rowData[a.name] = row.runAccounts[a.id] || 0;
        });

        return rowData;
      });

      // 1. Create the worksheet from your JSON data
      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // 2. Define the columns you want to measure
      const objectKeys = Object.keys(exportData[0]);

      // 3. Calculate the maximum length for each column
      const colWidths = objectKeys.map(key => {
        // Find the longest string in this column
        const maxChar = exportData.reduce((acc, row) => {
          const val = row[key] ? row[key].toString() : "";
          return Math.max(acc, val.length);
        }, key.length); // Start with the header length

        return { wch: maxChar + 2 }; // Add a little extra padding (2 chars)
      });

      // 4. Apply the widths to the worksheet
      worksheet['!cols'] = colWidths;
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, displayDate);

      // 1. Generate the Excel binary data
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

      // 2. Convert to Base64 (Required for Capacitor Filesystem)
      const base64Data = btoa(
        new Uint8Array(excelBuffer)
          .reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      const fileName = `Ledger_${currentMonth}.xlsx`;

      // 3. Write file to the Documents directory on the phone
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Documents,
      });

      // 4. Open the file immediately so the user can save/view it
      await FileOpener.openFile({
        path: savedFile.uri,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

    } catch (error) {
      console.error("Export failed:", error);
      alert("Could not export file: " + error.message);
    }
  };

  return (
    <div>
      {/* HEADER & MONTH NAVIGATION */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: COLORS.text }}>📊 Excel Sheet</div>
        <Btn onClick={exportToExcel} style={{ padding: "8px 12px", fontSize: 12 }}>⬇ Export .xlsx</Btn>
      </div>

      <Card style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}>
        <div style={{ color: COLORS.textMuted, fontSize: 12, fontWeight: 600 }}>MONTHLY LEDGER</div>
        <div style={{ display: "flex", alignItems: "center", background: COLORS.bg, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
          <button onClick={() => handleMonthChange(-1)} style={{ background: "none", border: "none", color: COLORS.accent, padding: "6px 10px", cursor: "pointer", fontWeight: "bold" }}>←</button>
          <span style={{ color: COLORS.text, fontSize: 13, fontWeight: 700, padding: "0 8px", minWidth: 100, textAlign: "center" }}>
            {displayDate}
          </span>
          <button onClick={() => handleMonthChange(1)} style={{ background: "none", border: "none", color: COLORS.accent, padding: "6px 10px", cursor: "pointer", fontWeight: "bold" }}>→</button>
        </div>
      </Card>

      {/* SPREADSHEET TABLE */}
      <div style={{ overflowX: "auto", background: COLORS.card, borderRadius: 12, border: `1px solid ${COLORS.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left", whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.textMuted }}>
              <th style={{ padding: "12px" }}>Date</th>
              <th style={{ padding: "12px" }}>Info</th>
              <th style={{ padding: "12px" }}>Account</th>
              <th style={{ padding: "12px", color: COLORS.income }}>In</th>
              <th style={{ padding: "12px", color: COLORS.expense }}>Out</th>
              <th style={{ padding: "12px", color: COLORS.text }}>Total Bal</th>
              {accounts.map(acc => <th key={acc.id} style={{ padding: "12px" }}>{acc.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {ledgerData.map(row => {
              const acc = accounts.find(a => a.id === row.accountId);

              const isIn = row.type === "income" || (row.type === "opening" && row.amount >= 0);
              const isOut = row.type === "expense" || (row.type === "opening" && row.amount < 0);

              return (
                <tr key={row.id} style={{ borderBottom: `1px solid ${COLORS.border}`, background: row.type === "opening" ? "rgba(255,255,255,0.03)" : "transparent" }}>
                  <td style={{ padding: "12px", color: COLORS.textMuted }}>{row.date.slice(5)}</td>
                  <td style={{ padding: "12px", color: row.type === "opening" ? COLORS.textMuted : COLORS.text, fontStyle: row.type === "opening" ? "italic" : "normal" }}>
                    {row.note || "—"}
                  </td>
                  <td style={{ padding: "12px", color: COLORS.textSub }}>{acc?.name || "—"}</td>

                  {/* IN Column */}
                  <td style={{ padding: "12px", color: COLORS.income, fontWeight: "bold" }}>
                    {isIn && row.amount !== 0 ? fmt(Math.abs(row.amount)) : ""}
                  </td>

                  {/* OUT Column */}
                  <td style={{ padding: "12px", color: COLORS.expense, fontWeight: "bold" }}>
                    {isOut && row.amount !== 0 ? fmt(Math.abs(row.amount)) : ""}
                  </td>

                  {/* TOTAL BAL Column */}
                  <td style={{ padding: "12px", color: COLORS.text, fontWeight: "bold", background: "rgba(255,255,255,0.02)" }}>
                    {fmt(row.runTotal)}
                  </td>

                  {/* BANK COLUMNS */}
                  {accounts.map(a => (
                    <td key={a.id} style={{ padding: "12px", color: COLORS.textMuted, background: "rgba(255,255,255,0.02)" }}>
                      {fmt(row.runAccounts[a.id] || 0)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {ledgerData.length === 0 && <div style={{ padding: 40, textAlign: "center", color: COLORS.textMuted }}>No transactions found for {displayDate}.</div>}
      </div>
    </div>
  );
}

const PageTransition = ({ children, k }) => (
  <motion.div
    key={k}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.4, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function PocketLedger() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));

  const [accounts, setAccounts] = useState([
    { id: "bank_secondary", name: "SBI", icon: "🏛️", color: "#0e3ba4" },
    { id: "bank_primary", name: "Federal Bank", icon: "🏦", color: "#7EB8FF" },
    { id: "cash", name: "Cash in Hand", icon: "💵", color: "#5de61e" },
  ]);
  const [categories, setCategories] = useState([]);
  const [people, setPeople] = useState([]);
  const [goals, setGoals] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTxn, setEditTxn] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // New Auth States
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [isLocked, setIsLocked] = useState(Capacitor.isNativePlatform());

  const performBiometricAuth = async () => {
    try {
      const result = await NativeBiometric.isAvailable();

      if (result.isAvailable) {
        const authResult = await NativeBiometric.verifyIdentity({
          reason: "Unlock Mee-Zaan",
          title: "Biometric Login",
          subtitle: "Use your fingerprint to continue",
          description: "Your financial data is protected.",
        });

        setIsLocked(false); // Unlock the app on success
      } else {
        setIsLocked(false); // No fingerprint set up, just let them in
      }
    } catch (error) {
      console.error("Auth failed", error);
      // You can handle "Cancel" or "Failed" here (e.g., show a 'Retry' button)
    }
  };

  useEffect(() => {
    if (user && Capacitor.isNativePlatform()) {
      performBiometricAuth();
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      // Save user to DB when they successfully return from the redirect
      if (currentUser) {
        await setDoc(doc(db, "users", currentUser.uid), {
          name: currentUser.displayName,
          email: currentUser.email,
          photoURL: currentUser.photoURL,
          lastLogin: new Date(),
        }, { merge: true });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "users", user.uid, "transactions"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txnData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id, // Fixed: Placed AFTER data spread
          date: data.date?.toDate ? data.date.toDate().toISOString().split("T")[0] : data.date,
          isDeleted: data.isDeleted ?? false,
        };
      });
      setTransactions(txnData);
    });
    return () => unsubscribe();
  }, [user]);

  // --- SILENT WIDGET UPDATER ---
  useEffect(() => {
    // Only run if we have a user and transactions to calculate
    if (!user || transactions.length === 0) return;

    const updateWidgetData = async () => {
      const balancesMap = {};
      let totalLiquid = 0;

      // Calculate all-time balances for each account
      accounts.forEach(acc => {
        const accTxns = transactions.filter(t => !t.isDeleted && t.accountId === acc.id);
        const bal = accTxns.reduce((s, t) => t.type === "income" ? s + t.amount : s - t.amount, 0);

        // Use the ID as the key for easy widget access
        balancesMap[acc.id] = bal;
        totalLiquid += bal;
      });

      try {
        const balanceRef = doc(db, "users", user.uid, "balances", "current");
        await setDoc(balanceRef, {
          ...balancesMap,
          total_liquid: totalLiquid,
          updatedAt: serverTimestamp()
        }, { merge: true });

        console.log("Widget balances updated successfully");
      } catch (e) {
        console.error("Widget sync failed:", e);
      }
    };

    updateWidgetData();
  }, [user, transactions, accounts]);

  useEffect(() => {
    const setupReminders = async () => {
      // 1. Request permission (Required for Android 13+)
      const permission = await LocalNotifications.requestPermissions();
      if (permission.display !== 'granted') return;

      // 2. Clear existing to prevent duplicates
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel(pending);
      }

      // 3. Schedule 2:00 PM and 9:00 PM reminders
      await LocalNotifications.schedule({
        notifications: [
          {
            title: "💰 Time to Sync!",
            body: "Don't forget to add your afternoon expenses to Mee-Zaan.",
            id: 1400,
            schedule: { on: { hour: 14, minute: 0 }, repeats: true },
            sound: null,
            actionTypeId: "",
            extra: null
          },
          {
            title: "🌙 Daily Wrap-up",
            body: "Ready to close the day? Add your final expenses now.",
            id: 2100,
            schedule: { on: { hour: 21, minute: 0 }, repeats: true },
            sound: null,
            actionTypeId: "",
            extra: null
          }
        ]
      });
    };

    if (user) setupReminders();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = collection(db, "users", user.uid, "people");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const peopleData = snapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id, // Fixed: Placed AFTER data spread
      }));
      setPeople(peopleData);
    });
    return () => unsubscribe();
  }, [user]);

  // --- ADD THESE TWO NEW USE-EFFECTS ---

  // Fetch Goals
  useEffect(() => {
    if (!user) return;
    const q = collection(db, "users", user.uid, "goals");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const goalsData = snapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      }));
      setGoals(goalsData);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Liabilities
  useEffect(() => {
    if (!user) return;
    const q = collection(db, "users", user.uid, "liabilities");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liabData = snapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      }));
      setLiabilities(liabData);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "users", user.uid, "categories"),
      orderBy("createdAt", "asc") // "asc" for oldest first, "desc" for newest first
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const catData = snapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      }));
      // If the user has no categories yet (new account), you could seed defaults here
      if (catData.length > 0) {
        setCategories(catData);
      }
    });
    return () => unsubscribe();
  }, [user]);

  const addPerson = async (personData) => {
    if (!user) return null;

    try {
      // Fixed: Duplicate entry protection based on name
      const existing = people.find(p => p.name.toLowerCase() === personData.name.toLowerCase());

      if (existing) {
        let newBalance = existing.balance;

        if (existing.type === personData.type) {
          newBalance += personData.balance;
        } else {
          newBalance -= personData.balance;
        }

        let newType = existing.type;
        if (newBalance < 0) {
          newBalance = Math.abs(newBalance);
          newType = existing.type === "lend" ? "owe" : "lend";
        }

        const ref = doc(db, "users", user.uid, "people", existing.id);
        await updateDoc(ref, {
          balance: newBalance,
          type: newType,
          updatedAt: serverTimestamp()
        });
        return existing.id;
      } else {
        const docRef = await addDoc(collection(db, "users", user.uid, "people"), {
          name: personData.name,
          balance: personData.balance,
          type: personData.type,
          createdAt: serverTimestamp(),
        });
        return docRef.id;
      }
    } catch (error) {
      console.error("Add Person Error:", error);
      return null;
    }
  };

  const handleSignUp = async (e) => {
    if (e) e.preventDefault();
    setAuthError("");
    if (!authEmail || !authPassword || !authName) return setAuthError("All fields are required.");

    setIsAuthLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      await updateProfile(userCredential.user, { displayName: authName });

      // Force local state update so the UI immediately shows the new name
      setUser({ ...userCredential.user, displayName: authName });

      await setDoc(doc(db, "users", userCredential.user.uid), {
        name: authName,
        email: authEmail,
        createdAt: serverTimestamp(),
      }, { merge: true });
    } catch (error) {
      setAuthError(error.message.replace("Firebase: ", ""));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setAuthError("");
    if (!authEmail || !authPassword) return setAuthError("Email and password are required.");

    setIsAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (error) {
      setAuthError("Invalid email or password.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = async () => await signOut(auth);

  const saveTransaction = async (txnData) => {
    if (!user) return;

    try {
      const { id, ...data } = txnData;

      if (id) {
        // Edit flow
        const txnRef = doc(db, "users", user.uid, "transactions", id);
        await updateDoc(txnRef, {
          ...data,
          updatedAt: serverTimestamp(),
        });
      } else {
        // Create flow
        const docRef = await addDoc(collection(db, "users", user.uid, "transactions"), {
          ...data,
          createdAt: serverTimestamp(),
          isDeleted: false
        });

        if (data.type === "expense" && data.spendType === "other" && data.personId) {
          const personRef = doc(db, "users", user.uid, "people", data.personId);
          await updateDoc(personRef, {
            balance: increment(data.amount)
          });
        }
      }
    } catch (error) {
      console.error("Save Transaction Error:", error);
    }
  };

  const deleteTransaction = (id) => {
    if (!user) return;
    setConfirmDialog({
      title: "Delete Transaction",
      message: "Are you sure you want to delete this transaction? It will be moved to the trash.",
      onConfirm: async () => {
        try {
          const txnRef = doc(db, "users", user.uid, "transactions", id);
          await updateDoc(txnRef, { isDeleted: true, deletedAt: serverTimestamp() });
        } catch (error) {
          console.error("Delete Error:", error);
        }
        setConfirmDialog(null);
      }
    });
  };

  const restoreTransaction = async (id) => {
    if (!user) return;
    try {
      const txnRef = doc(db, "users", user.uid, "transactions", id);
      await updateDoc(txnRef, { isDeleted: false });
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

  // ─── FIREBASE-BACKED CATEGORY ACTIONS ───

  const saveCategory = async (catData) => {
    if (!user) return;
    try {
      // Use the existing user-specific category collection
      const catRef = doc(db, "users", user.uid, "categories", catData.id);
      await setDoc(catRef, {
        ...catData,
        createdAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error("Save Category Error:", error);
    }
  };

  const deleteCategory = async (id) => {
    if (!user) return;
    setConfirmDialog({
      title: "Delete Category",
      message: "Are you sure? This won't delete the transactions in this category, but it will remove the category from your list.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "users", user.uid, "categories", id));
        } catch (error) {
          console.error("Delete Category Error:", error);
        }
        setConfirmDialog(null);
      }
    });
  };

  const TABS = [
    { id: "dashboard", label: "Home", icon: "🏠" },
    { id: "transactions", label: "Logs", icon: "📋" },
    { id: "add", label: "Add", icon: "➕" },
    { id: "dues", label: "Dues", icon: "🤝" },
    { id: "balances", label: "Balances", icon: "💳" },
  ];

  const DRAWER_ITEMS = [
    { id: "dashboard", icon: "🏠", label: "Dashboard" },
    { id: "transactions", icon: "📋", label: "Transactions" },
    { id: "dues", icon: "🤝", label: "Dues" },
    { id: "balances", icon: "💳", label: "Balances" },
    { id: "sheet", icon: "📊", label: "Excel Sheet" },
    { id: "goals", icon: "🎯", label: "Goals" },
    { id: "categories", icon: "⚙️", label: "Categories" },
  ];

  const renderScreen = () => {
    switch (activeTab) {
      case "dashboard": return <Dashboard transactions={transactions} categories={categories} people={people} goals={goals} liabilities={liabilities} currentMonth={currentMonth} onMonthChange={setCurrentMonth} />;
      case "transactions": return <Transactions transactions={transactions} categories={categories} people={people}
        onDelete={deleteTransaction}
        onRestore={restoreTransaction}
        onEdit={t => { setEditTxn(t); setShowAddModal(true); }}
        accounts={accounts}
        currentMonth={currentMonth} />;
      case "dues":
        return <Dues people={people} onMarkPaid={markPersonPaid} onAddPerson={addPerson} />;
      case "balances":
        return <BalancesScreen accounts={accounts} transactions={transactions} currentMonth={currentMonth} />;
      case "goals":
        return (
          <GoalsScreen
            goals={goals}
            liabilities={liabilities}
            onAddGoal={saveGoal}
            onUpdateGoal={(id, saved) => saveGoal({ id, savedAmount: saved })}
            onDeleteGoal={deleteGoal}
            onAddLiability={saveLiability}
            onDeleteLiability={deleteLiability}
          />
        );
      case "categories":
        return (
          <CategoriesScreen
            categories={categories}
            onAdd={saveCategory}
            onDelete={deleteCategory}
          />
        );
      case "sheet":
        return <SheetScreen
          transactions={transactions}
          categories={categories}
          accounts={accounts}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
        />;
      default: return null;
    }
  };

  // Inside PocketLedger component
  const saveGoal = async (goalData) => {
    if (!user) return;
    const { id, ...data } = goalData;
    const goalRef = doc(db, "users", user.uid, "goals", id);
    // Using setDoc with merge: true handles both creating and updating
    await setDoc(goalRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  };

  const deleteGoal = (id) => {
    if (!user) return;
    setConfirmDialog({
      title: "Delete Goal",
      message: "Are you sure you want to permanently delete this saving goal? This action cannot be undone.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "users", user.uid, "goals", id));
        } catch (error) {
          console.error("Delete Goal Error:", error);
        }
        setConfirmDialog(null);
      }
    });
  };

  const saveLiability = async (liabData) => {
    if (!user) return;
    const { id, ...data } = liabData;
    const liabRef = doc(db, "users", user.uid, "liabilities", id);
    await setDoc(liabRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
  };

  const deleteLiability = (id) => {
    if (!user) return;
    setConfirmDialog({
      title: "Delete Liability",
      message: "Are you sure you want to permanently delete this liability? This action cannot be undone.",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "users", user.uid, "liabilities", id));
        } catch (error) {
          console.error("Delete Liability Error:", error);
        }
        setConfirmDialog(null);
      }
    });
  };

  if (loading) return <div>Loading...</div>;

  if (!user) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
        background: `radial-gradient(circle at 20% 20%, #1e3a5f, transparent 40%), radial-gradient(circle at 80% 80%, #0f766e, transparent 40%), #0b0f19`
      }}>
        <div style={{
          width: "100%", maxWidth: "420px", padding: "40px 32px", borderRadius: "28px",
          background: "rgba(20, 24, 35, 0.55)", backdropFilter: "blur(25px)", WebkitBackdropFilter: "blur(25px)",
          border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 40px 80px rgba(0,0,0,0.7)", textAlign: "center"
        }}>

          <img
            src="pocketLedger.png"
            alt="Mee-Zaan Logo"
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "22px",
              boxShadow: "0 12px 35px rgba(0,0,0,0.3)",
              objectFit: "cover"
            }}
          />

          <h1 style={{ fontSize: "28px", fontWeight: "800", letterSpacing: "-0.03em", color: "#f1f5f9", marginBottom: "8px" }}>
            Mee-Zaan
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "28px" }}>
            {authMode === "login" ? "Welcome back" : "Create your account"}
          </p>

          {/* Form Area */}
          <div style={{ textAlign: "left" }}>
            <Toggle value={authMode} onChange={(v) => { setAuthMode(v); setAuthError(""); }} options={[
              { value: "login", label: "Login", color: COLORS.accent },
              { value: "signup", label: "Sign Up", color: COLORS.accent }
            ]} />

            <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "2px" }}>
              {authMode === "signup" && (
                <Input label="Full Name" value={authName} onChange={setAuthName} placeholder="Name" />
              )}

              <Input label="Email Address" type="email" value={authEmail} onChange={setAuthEmail} placeholder="you@example.com" />
              <Input label="Password" type="password" value={authPassword} onChange={setAuthPassword} placeholder="••••••••" />

              {authError && <div style={{ color: COLORS.expense, fontSize: "13px", fontWeight: "600", marginBottom: "12px", textAlign: "center" }}>{authError}</div>}

              <Btn onClick={authMode === "login" ? handleLogin : handleSignUp} style={{ width: "100%", padding: "14px 0", marginTop: "8px" }}>
                {isAuthLoading ? "Processing..." : (authMode === "login" ? "Log In" : "Create Account")}
              </Btn>
            </div>
          </div>

        </div>
      </div>
    );
  }

  //biometric uncomment next mobile build
  if (user && isLocked) {
    return (
      <div style={{
        height: '100vh', background: COLORS.bg, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <img src="pocketLedger.png" width="80" height="80" style={{ borderRadius: 20, marginBottom: 20 }} />
        <h2 style={{ color: COLORS.text }}>Mee-Zaan is Locked</h2>
        <Btn onClick={performBiometricAuth} style={{ marginTop: 20 }}>
          Tap to Unlock
        </Btn>
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

      <div style={{
        position: "sticky", top: 0, zIndex: 100, background: COLORS.bg + "ee",
        backdropFilter: "blur(12px)", borderBottom: `1px solid ${COLORS.border}`,
        // Use padding that respects the mobile safe area
        padding: "max(14px, env(safe-area-inset-top) + 14px) 20px 14px 20px",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setDrawerOpen(v => !v)}
            style={{ background: "none", border: "none", color: COLORS.textSub, cursor: "pointer", fontSize: 20, padding: 4 }}>
            ☰
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src="pocketLedger.png"
              alt="Mee-Zaan Logo"
              style={{
                width: "40px",
                height: "40px",
                boxShadow: "0 12px 35px rgba(0,0,0,0.3)",
                objectFit: "cover"
              }}
            />
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.02em" }}>Mee-Zaan</span>
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

      <AnimatePresence>
        {drawerOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
            {/* 1. Animated Backdrop (Dimming Effect) */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            />

            {/* 2. Animated Sidebar (Slide Effect) */}
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              onClick={e => e.stopPropagation()}
              style={{
                position: "relative", width: 260, height: "100%", background: COLORS.card,
                borderRight: `1px solid ${COLORS.border}`, padding: "24px 16px", display: "flex",
                flexDirection: "column", gap: 4, boxShadow: "20px 0 50px rgba(0,0,0,0.5)"
              }}
            >
              {/* --- TOP: LOGO --- */}
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 20, padding: "0 8px", display: "flex", alignItems: "center", gap: 10 }}>
                <img src="pocketLedger.png" alt="Mee-Zaan Logo" style={{ width: "36px", height: "36px", borderRadius: "10px", objectFit: "cover" }} />
                Mee-Zaan
              </div>

              {/* --- MIDDLE: NAVIGATION --- */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                {DRAWER_ITEMS.map(item => (
                  <button key={item.id} onClick={() => { setActiveTab(item.id); setDrawerOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12,
                      background: activeTab === item.id ? COLORS.accentDim : "transparent",
                      border: `1px solid ${activeTab === item.id ? COLORS.accent + "44" : "transparent"}`,
                      color: activeTab === item.id ? COLORS.accent : COLORS.textSub,
                      fontWeight: 600, fontSize: 14, cursor: "pointer", textAlign: "left", transition: "all 0.2s"
                    }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span> {item.label}
                  </button>
                ))}
              </div>

              {/* --- BOTTOM: PROFILE & LOGOUT --- */}
              <div style={{ marginTop: "auto", paddingTop: 20, borderTop: `1px solid ${COLORS.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 8px", marginBottom: 16 }}>
                  <img
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`}
                    width="38" height="38"
                    style={{ borderRadius: "10px", objectFit: "cover", border: `2px solid ${COLORS.border}` }}
                    alt="profile"
                  />
                  <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <span style={{ color: COLORS.text, fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {user.displayName}
                    </span>
                    <span style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>
                      Personal Wallet
                    </span>
                  </div>
                </div>

                <button onClick={logout} style={{
                  width: "100%", background: COLORS.expenseDim, border: `1px solid ${COLORS.expense}33`,
                  color: COLORS.expense, padding: "12px", borderRadius: "12px",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8
                }}>
                  Sign Out
                </button>

                <div style={{ color: COLORS.textMuted, fontSize: 9, textAlign: "center", marginTop: 12, letterSpacing: "0.05em" }}>
                  FIREBASE SYNC ENABLED ☁️
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 16px 100px" }}>
        <AnimatePresence mode="wait">
          <PageTransition k={activeTab}>
            {renderScreen()}
          </PageTransition>
        </AnimatePresence>
      </div>
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

      {showAddModal && (
        <Modal title={editTxn ? "✏️ Edit Transaction" : "➕ New Transaction"} onClose={() => { setShowAddModal(false); setEditTxn(null); }}>
          <AddTransaction
            categories={categories} people={people}
            onAdd={saveTransaction}
            onAddPerson={addPerson}
            accounts={accounts}
            editTxn={editTxn}
            onClose={() => { setShowAddModal(false); setEditTxn(null); }}
          />
        </Modal>
      )}
      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}