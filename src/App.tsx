
// @ts-nocheck
import React, { useState, useEffect, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  LayoutDashboard, CreditCard, FileText, Settings, 
  Wallet, Upload, Bell, User, Check, AlertCircle, TrendingUp, 
  Search, Filter, Plus, MessageSquare 
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // --- STATE ---
  const [transactions, setTransactions] = useState([]); 
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [smsInput, setSmsInput] = useState('');
  const [uploadStatus, setUploadStatus] = useState(null);

  // --- 1. THE "SMART BRAIN" (Auto-Categorization) ---
  const autoCategorize = (cleanName, amount) => {
    if (!cleanName) return 'Uncategorized';
    const text = cleanName.toLowerCase();

    // 1. INCOME
    if (text.includes('salary') || text.includes('credit') || text.includes('refund') || text.includes('dividend') || text.includes('interest')) return 'Income';

    // 2. EXPENSES
    if (text.match(/zomato|swiggy|starbucks|mcdonald|domino|pizza|burger|kfc|cafe|restaurant|bakers|food|tea|coffee/)) return 'Food';
    if (text.match(/uber|ola|rapido|shell|petrol|fuel|hpcl|bpcl|irctc|metro|flight|air|travel|cab/)) return 'Transport';
    if (text.match(/blinkit|zepto|bigbasket|dmart|reliance|fresh|mart|supermarket|grocer/)) return 'Groceries';
    if (text.match(/amazon|flipkart|myntra|ajio|shopping|retail|store|fashion|cloth/)) return 'Shopping';
    if (text.match(/jio|airtel|vi |vodafone|bescom|tneb|electricity|water|gas|bill|recharge|tatasky/)) return 'Bills';
    if (text.match(/pharmacy|medplus|apollo|practo|hospital|clinic|doctor|lab|scan/)) return 'Health';
    if (text.match(/netflix|spotify|prime|hotstar|youtube|movie|cinema|bookmyshow/)) return 'Entertainment';
    if (text.match(/upi|transfer|sent to|paid to/)) return 'Transfer';

    return amount > 10000 ? 'Major Expense' : 'General';
  };

  // --- 2. CORE PARSER LOGIC (Used by both Manual Paste & Auto-SMS) ---
  const extractTransactionFromText = (text) => {
    // A. Spam Filter
    if (/otp|login|auth|code|verification/i.test(text)) return null;

    // B. Extract Amount
    const amountRegex = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{0,2})?)/i;
    const amountMatch = text.match(amountRegex);
    if (!amountMatch) return null; // Invalid SMS
    
    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    const isCredit = /credited|received|deposited|added/i.test(text);

    // C. Extract Vendor (The Advanced Regex)
    let rawVendor = "Unknown";
    const upiRegex = /(?:UPI-)([A-Za-z0-9\s\-\.\&]+)/i;
    const upiMatch = text.match(upiRegex);

    if (upiMatch) {
      rawVendor = upiMatch[1];
    } else {
      // Regex allows '&' and stops at '('
      const vendorRegex = /(?:at|to|via|from|merchant|paid)\s+([A-Za-z0-9\s\-\.\*\/\&@]+?)(?:\s+on|\s+ref|\s+txn|\.|\(|$)/i;
      const vendorMatch = text.match(vendorRegex);
      if (vendorMatch) rawVendor = vendorMatch[1].trim();
    }

    // D. Clean the Vendor Name
    let cleanVendor = rawVendor
      .replace(/a\/c|acct|account|\*|xx|ending|card|pos|txn|info|ref|no\.|bsnl|bank|neft|imps|rtgs|upi|pvt|ltd/gi, "")
      .replace(/[0-9]{4,}/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // E. Blacklist Check (Fixes "AT", "TO")
    if (/^(at|to|via|from|unknown)$/i.test(cleanVendor) || cleanVendor.length < 2) {
      cleanVendor = isCredit ? "Incoming Transfer" : "Transfer to Account";
    }

    // Return final object
    return {
      id: `sms-${Date.now()}-${Math.random()}`,
      vendor: cleanVendor.toUpperCase(),
      amount: amount,
      date: new Date().toLocaleDateString(),
      category: isCredit ? 'Income' : autoCategorize(cleanVendor, amount),
      status: 'verified'
    };
  };

  // --- 3. MANUAL PASTE HANDLER ---
  const handleManualPaste = () => {
    if (!smsInput) return;
    const result = extractTransactionFromText(smsInput);
    
    if (result) {
      setTransactions(prev => [result, ...prev]);
      setSmsInput('');
      setShowPasteModal(false);
      setActiveTab('transactions');
    } else {
      alert("Could not detect a valid transaction. Check the text format.");
    }
  };

  // --- 4. AUTOMATIC SMS LISTENER (Android Only) ---
  useEffect(() => {
    const isApp = window.cordova || window.Capacitor;
    if (isApp && window.SMSReceive) {
      console.log("Starting Auto-SMS Watcher...");
      window.SMSReceive.startWatch(
        () => {
          document.addEventListener('onSMSArrive', (e) => {
            const incomingSms = e.data;
            const result = extractTransactionFromText(incomingSms.body);
            
            if (result) {
              setTransactions(prev => [result, ...prev]);
              // Optional: Toast notification here
              console.log("Auto-added:", result.vendor);
            }
          });
        },
        (err) => console.log('Error starting SMS watch:', err)
      );
    }

    return () => {
      if (isApp && window.SMSReceive) window.SMSReceive.stopWatch();
    };
  }, []);

  // --- 5. CSV IMPORT LOGIC ---
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploadStatus("Processing...");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedData = results.data.map((row, index) => {
          const keys = Object.keys(row);
          const lowerKeys = keys.map(k => k.toLowerCase());
          const findKey = (keywords) => {
            const idx = lowerKeys.findIndex(k => keywords.some(word => k.includes(word)));
            return idx !== -1 ? keys[idx] : null;
          };

          const descKey = findKey(['desc', 'narration', 'particular', 'remark', 'memo', 'detail']);
          const amountKey = findKey(['amount', 'debit', 'withdraw', 'value', 'inr']);
          
          if (!descKey || !amountKey) return null;

          const rawAmount = row[amountKey];
          const cleanAmount = parseFloat(rawAmount.toString().replace(/[^0-9.-]+/g, ""));
          const vendorName = row[descKey] || 'Unknown';

          return {
            id: `imp-${Date.now()}-${index}`,
            vendor: vendorName,
            amount: isNaN(cleanAmount) ? 0 : Math.abs(cleanAmount),
            date: new Date().toLocaleDateString(),
            category: autoCategorize(vendorName, cleanAmount),
            status: 'pending'
          };
        }).filter(Boolean);

        setTransactions(prev => [...parsedData, ...prev]);
        setUploadStatus(null);
        setActiveTab('transactions');
      }
    });
  };

  const handleConfirm = (id) => {
    setTransactions(transactions.map(t => t.id === id ? { ...t, status: 'verified' } : t));
  };

  // --- CALCULATIONS ---
  const spentAmount = useMemo(() => transactions.reduce((acc, t) => t.category !== 'Income' ? acc + t.amount : acc, 0), [transactions]);
  const incomeAmount = useMemo(() => transactions.reduce((acc, t) => t.category === 'Income' ? acc + t.amount : acc, 0), [transactions]);
  const totalBalance = (10000 + incomeAmount) - spentAmount; 

  // --- COMPONENT: DASHBOARD VIEW ---
  const DashboardView = () => (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 text-white shadow-lg shadow-emerald-200 hover:-translate-y-1 transition-transform">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-emerald-100 text-sm font-medium mb-1">Current Balance</p>
              <h3 className="text-4xl font-bold tracking-tight">₹{totalBalance.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
              <TrendingUp size={24} className="text-emerald-100" />
            </div>
          </div>
          <div className="mt-8 flex gap-2">
            <span className="bg-white/20 px-2 py-1 rounded-md text-xs font-medium backdrop-blur-sm">Live Updates</span>
          </div>
        </div>

        {/* Spending Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center relative h-64">
          <h4 className="absolute top-6 left-6 font-semibold text-slate-700">Total Spent</h4>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[{ value: spentAmount || 1 }, { value: totalBalance > 0 ? totalBalance : 1 }]} 
                innerRadius={60} outerRadius={80}
                startAngle={90} endAngle={-270}
                dataKey="value"
              >
                <Cell fill="#ef4444" />
                <Cell fill="#f1f5f9" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center mt-2">
            <span className="text-2xl font-bold text-slate-800">₹{spentAmount.toLocaleString()}</span>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Outflow</p>
          </div>
        </div>

        {/* Action Card */}
        <div className="bg-slate-900 p-6 rounded-2xl shadow-sm flex flex-col justify-center text-center">
            <h4 className="font-bold text-white mb-2">New Transaction?</h4>
            <p className="text-slate-400 text-sm mb-4">Copy your bank SMS and paste it here.</p>
            <button 
              onClick={() => setShowPasteModal(true)}
              className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors"
            >
              <MessageSquare size={18} /> Paste SMS
            </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-800">Recent Activity</h3>
          <button onClick={() => setActiveTab('transactions')} className="text-sm text-emerald-600 font-medium hover:text-emerald-700">View All</button>
        </div>
        <div className="space-y-4">
          {transactions.length === 0 ? <p className="text-slate-400 text-sm">No transactions yet.</p> : transactions.slice(0, 3).map((t) => (
            <div key={t.id} className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-full ${t.category === 'Food' ? 'bg-orange-100 text-orange-600' : t.category === 'Income' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-600'}`}>
                  {t.category === 'Food' ? <CreditCard size={18} /> : <FileText size={18} />}
                </div>
                <div>
                  <p className="font-medium text-slate-800">{t.vendor}</p>
                  <p className="text-xs text-slate-500">{t.date}</p>
                </div>
              </div>
              <span className={`font-bold ${t.category === 'Income' ? 'text-emerald-600' : 'text-slate-700'}`}>
                {t.category === 'Income' ? '+' : ''}₹{t.amount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // --- COMPONENT: TRANSACTIONS VIEW ---
  const TransactionsView = () => (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800">All Transactions</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowPasteModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 shadow-md"
          >
            <Plus size={16} /> Add via Text
          </button>
          
          <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 cursor-pointer shadow-sm">
            <Upload size={16} /> 
            {uploadStatus || "Import CSV"}
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {/* Review Queue */}
      {transactions.some(t => t.status === 'pending') && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="text-amber-600" size={20} />
            <h3 className="font-bold text-amber-900">Review Needed ({transactions.filter(t => t.status === 'pending').length})</h3>
          </div>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
            {transactions.filter(t => t.status === 'pending').map((t) => (
              <div key={t.id} className="flex items-center justify-between bg-white p-4 rounded-lg border border-amber-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-1 bg-amber-400 rounded-full"></div>
                  <div className="overflow-hidden">
                    <h4 className="font-bold text-slate-800 truncate w-40 md:w-auto">{t.vendor}</h4>
                    <p className="text-xs text-slate-500">{t.date} • <span className="text-amber-600 font-medium">{t.category}</span></p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono font-bold text-slate-700">₹{t.amount}</span>
                  <button onClick={() => handleConfirm(t.id)} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700">
                    <Check size={16} /> Confirm
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm min-h-[300px]">
        {transactions.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="mb-2">No data found.</p>
            <p className="text-xs">Paste an SMS or upload a CSV to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-800">Vendor</th>
                  <th className="px-6 py-4 font-semibold text-slate-800">Category</th>
                  <th className="px-6 py-4 font-semibold text-slate-800">Status</th>
                  <th className="px-6 py-4 font-semibold text-slate-800 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800">{t.vendor}</td>
                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded-md text-xs ${t.category === 'Income' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{t.category}</span></td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {t.status === 'verified' ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-right font-bold ${t.category === 'Income' ? 'text-emerald-600' : 'text-slate-800'}`}>
                      {t.category === 'Income' ? '+' : ''}₹{t.amount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-800 overflow-hidden relative">
      
      {/* --- PASTE MODAL --- */}
      {showPasteModal && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl animate-fade-in">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Paste Bank SMS</h3>
            <p className="text-sm text-slate-500 mb-4">Example: "Acct debited INR 500 at Starbucks..."</p>
            <textarea 
              className="w-full h-32 p-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none mb-4 resize-none bg-slate-50"
              placeholder="Paste text here..."
              value={smsInput}
              onChange={(e) => setSmsInput(e.target.value)}
            ></textarea>
            <div className="flex gap-3">
              <button onClick={() => setShowPasteModal(false)} className="flex-1 py-3 text-slate-600 font-medium hover:bg-slate-100 rounded-xl">Cancel</button>
              <button onClick={handleManualPaste} className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200">Parse & Add</button>
            </div>
          </div>
        </div>
      )}

      {/* --- SIDEBAR --- */}
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col shadow-2xl z-20">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-bold text-emerald-400 flex items-center gap-3">
            <Wallet className="stroke-2" /> SAMVID
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 mt-4">
          {['dashboard', 'transactions', 'reports', 'settings'].map((item) => (
            <div 
              key={item} 
              onClick={() => setActiveTab(item)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 capitalize
              ${activeTab === item 
                ? 'bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
            >
              {item === 'dashboard' && <LayoutDashboard size={20} />}
              {item === 'transactions' && <CreditCard size={20} />}
              {item === 'reports' && <FileText size={20} />}
              {item === 'settings' && <Settings size={20} />}
              <span className="text-sm tracking-wide">{item}</span>
            </div>
          ))}
        </nav>
      </aside>

      {/* --- MAIN AREA --- */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="bg-white border-b border-slate-200 h-16 flex justify-between items-center px-8 shadow-sm z-10">
          <div className="md:hidden font-bold text-emerald-600 flex items-center gap-2"><Wallet /> SAMVID</div>
          <h2 className="hidden md:block text-xl font-bold text-slate-800 capitalize">{activeTab}</h2>
          <div className="flex items-center gap-6">
            <Bell className="text-slate-400 hover:text-slate-600 cursor-pointer" size={20} />
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 border border-emerald-200">
              <User size={18} />
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/50">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'transactions' && <TransactionsView />}
          {activeTab === 'reports' && <div className="text-center text-slate-400 mt-20">Reports coming soon...</div>}
          {activeTab === 'settings' && <div className="text-center text-slate-400 mt-20">Settings coming soon...</div>}
        </div>

        {/* MOBILE BOTTOM NAV */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-3 pb-safe z-40">
           {['dashboard', 'transactions', 'reports'].map((item) => (
             <div key={item} onClick={() => setActiveTab(item)} className={`flex flex-col items-center gap-1 ${activeTab === item ? 'text-emerald-600' : 'text-slate-400'}`}>
               {item === 'dashboard' && <LayoutDashboard size={24} />}
               {item === 'transactions' && <CreditCard size={24} />}
               {item === 'reports' && <FileText size={24} />}
               <span className="text-[10px] capitalize font-medium">{item}</span>
             </div>
           ))}
        </div>
      </main>
    </div>
  );
}