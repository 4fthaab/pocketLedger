# Mee-Zaan (PocketLedger) 💰

**Mee-Zaan** (formerly pocketLedger) is a high-performance personal finance and expense tracking mobile application built with **React**, **Vite**, and **Capacitor**. It is designed to provide a "ledger-first" experience, offering granular control over multiple bank accounts, liabilities, and savings goals.

## 🚀 Key Features

* **Multi-Account Tracking**: Manage cumulative balances across various accounts including Cash in Hand, SBI, and Federal Bank.
* **Dynamic Excel Sheet View**: A unique, scrollable ledger view that mimics a professional spreadsheet, allowing you to track running totals and export data to `.xlsx`.
* **Smart Transfer Logic**: Automatically handles internal transfers between accounts (e.g., Bank to Cash) as sequential transactions to maintain accurate historical balances.
* **Debt & Dues Management**: Dedicated modules for "Lend/Owe" (Dues) and long-term Liabilities (Loans/EMIs) with progress tracking.
* **Visual Analytics**: Interactive Pie and Line charts (powered by Recharts) to monitor daily cash flow and category-wise spending.
* **Secure Authentication**: Custom Email/Password authentication system integrated with **Firebase Auth**.
* **Cloud Sync**: Real-time data persistence using **Firebase Firestore**.

## 🛠️ Tech Stack

* **Frontend**: React (Vite)
* **Mobile Wrapper**: Capacitor
* **Backend**: Firebase (Authentication & Firestore)
* **Charts**: Recharts
* **Data Export**: XLSX (SheetJS)
* **Styling**: Custom CSS with a focus on dark-mode glassmorphism

## 📥 Installation & Setup

### Prerequisites
* Node.js (v18+)
* Firebase Project Credentials
* Android Studio (for APK generation)

### Steps
1.  **Clone the repository**:
    ```bash
    git clone [https://github.com/4fthaab/mee-zaan.git](https://github.com/4fthaab/mee-zaan.git)
    cd mee-zaan
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Firebase**:
    Update your `src/firebase.js` with your project's configuration.

4.  **Run in Development Mode**:
    ```bash
    npm run dev
    ```

5.  **Build for Android**:
    ```bash
    npm run build
    npx cap sync
    npx cap open android
    ```

## 📸 Screenshots

| Dashboard | Transaction Logs | Excel View |
| :--- | :--- | :--- |
| ![Dashboard] | ![Logs] | ![Excel] |

## 🛡️ Privacy & Security
Mee-Zaan uses **Firebase's security rules** to ensure that each user can only access their own financial data. By moving to an **Email/Password** system, the app maintains independent session control while providing a secure login environment.

---
*Developed by Afthab Rahman [https://github.com/4fthaab]*