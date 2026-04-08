import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Plus, Receipt, Save, X } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { expenseService, ExpenseCategory, ExpenseRecord, ExpenseRecurrence } from '../services/expenseService';
import { savePipelineService } from '../services/savePipelineService';

const formatCurrency = (amount: number) =>
  amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

const categoryLabels: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'repair', label: 'Repair' },
  { value: 'software', label: 'Software' },
  { value: 'dump_fees', label: 'Dump Fees' },
  { value: 'labor', label: 'Labor' },
  { value: 'other', label: 'Other' },
];

export default function Expenses() {
  const location = useLocation();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('fuel');
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<ExpenseRecurrence>('none');
  const [nextDueDate, setNextDueDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const unsubscribeExpenses = expenseService.subscribeToExpenses(setExpenses);
    return () => unsubscribeExpenses();
  }, []);

  useEffect(() => {
    if (location.state?.openAddExpense) {
      setIsAddingExpense(true);
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const totalThisMonth = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((expense) => {
        const expenseDateValue = toDate(expense.expense_date);
        return expenseDateValue &&
          expenseDateValue.getMonth() === now.getMonth() &&
          expenseDateValue.getFullYear() === now.getFullYear();
      })
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  }, [expenses]);

  const recurringExpenses = useMemo(
    () => expenses.filter((expense) => expense.is_recurring && expense.status === 'active'),
    [expenses]
  );

  const resetExpenseForm = () => {
    setTitle('');
    setCategory('fuel');
    setAmount('');
    setVendor('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setIsRecurring(false);
    setRecurrenceFrequency('none');
    setNextDueDate('');
    setNotes('');
  };

  const handleSaveExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    const debugContext = {
      flow: 'quick_action_expense_save',
      traceId: savePipelineService.createTraceId('quick_action_expense_save'),
    };

    savePipelineService.log(debugContext, 'save_started');
    setErrorMessage(null);

    const parsedAmount = Number(amount || 0);
    if (parsedAmount <= 0) {
      savePipelineService.log(debugContext, 'validation_failed', 'Expense amount must be greater than zero.');
      setErrorMessage('Expense amount must be greater than zero.');
      return;
    }

    setIsSavingExpense(true);
    try {
      savePipelineService.log(debugContext, 'validation_passed');
      const response = await savePipelineService.withTimeout(
        expenseService.addExpense({
          title: title.trim() || categoryLabels.find((entry) => entry.value === category)?.label || 'Expense',
          category,
          amount: parsedAmount,
          vendor: vendor.trim(),
          notes: notes.trim(),
          expense_date: Timestamp.fromDate(new Date(expenseDate)),
          is_recurring: isRecurring,
          recurrence_frequency: isRecurring ? recurrenceFrequency : 'none',
          next_due_date: isRecurring && nextDueDate ? Timestamp.fromDate(new Date(nextDueDate)) : null,
          status: 'active',
        }),
        {
          timeoutMs: 25000,
          timeoutMessage: 'Expense save took too long and was stopped. Please try again.',
          debugContext,
        }
      );
      savePipelineService.log(debugContext, 'response_received', response?.id || 'expense_saved');

      resetExpenseForm();
      setIsAddingExpense(false);
      savePipelineService.log(debugContext, 'ui_success_handler_fired');
      setSuccessMessage('Expense saved');
    } catch (error) {
      savePipelineService.logError(debugContext, 'db_write_failed', error);
      console.error('Error saving expense:', error);
      const nextMessage = error instanceof Error && error.message
        ? error.message
        : 'Failed to save expense.';
      setErrorMessage(nextMessage);
    } finally {
      setIsSavingExpense(false);
      savePipelineService.log(debugContext, 'loading_state_cleared');
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Expenses</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Quick entry and structured recurring costs</p>
        </div>
        <button
          onClick={() => setIsAddingExpense(true)}
          className="px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Expense
        </button>
      </header>

      {errorMessage && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm font-bold text-red-700">{errorMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-100">
          <Receipt className="h-6 w-6 mb-4 text-blue-100" />
          <p className="text-3xl font-black">{expenses.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Total Expenses</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <Receipt className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-3xl font-black text-gray-900">{formatCurrency(totalThisMonth)}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">This Month</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <Receipt className="h-6 w-6 mb-4 text-green-600" />
          <p className="text-3xl font-black text-gray-900">{recurringExpenses.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Recurring</p>
        </div>
      </div>

      <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
        <h3 className="text-lg font-black text-gray-900 mb-6">Expense Log</h3>
        <div className="space-y-3">
          {expenses.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center">
              <p className="text-sm font-black text-gray-900">No expenses yet</p>
              <p className="text-xs font-bold text-gray-500 mt-2">Use the add button for quick fuel, supplies, repairs, and recurring costs.</p>
            </div>
          ) : (
            [...expenses]
              .sort((left, right) => (toDate(right.expense_date)?.getTime() || 0) - (toDate(left.expense_date)?.getTime() || 0))
              .map((expense) => (
                <div key={expense.id} className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-gray-900">{expense.title}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      {categoryLabels.find((entry) => entry.value === expense.category)?.label || expense.category}
                      {expense.vendor ? ` • ${expense.vendor}` : ''}
                      {expense.is_recurring ? ` • ${expense.recurrence_frequency}` : ''}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm font-black text-blue-600">{formatCurrency(expense.amount || 0)}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      {toDate(expense.expense_date)?.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
          )}
        </div>
      </section>

      {isAddingExpense && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-gray-900/50 p-0 sm:p-4">
          <div className="bg-white rounded-t-[32px] sm:rounded-[32px] w-full max-w-2xl max-h-[calc(100dvh-0.5rem)] sm:max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-black text-gray-900">New Expense</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Quick and recurring expense entry</p>
              </div>
              <button onClick={() => { setIsAddingExpense(false); resetExpenseForm(); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="flex-1 overflow-y-auto p-8 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block md:col-span-2">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Title</span>
                  <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Fuel fill-up"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Category</span>
                  <select
                    value={category}
                    onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {categoryLabels.map((entry) => (
                      <option key={entry.value} value={entry.value}>{entry.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Vendor</span>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(event) => setVendor(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Vendor or store"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Expense Date</span>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(event) => setExpenseDate(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </label>
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-gray-50 px-5 py-4 md:col-span-2">
                  <span className="text-sm font-black text-gray-900">Recurring expense</span>
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(event) => {
                      setIsRecurring(event.target.checked);
                      setRecurrenceFrequency(event.target.checked ? 'monthly' : 'none');
                    }}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
                {isRecurring && (
                  <>
                    <label className="block">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Recurrence</span>
                      <select
                        value={recurrenceFrequency}
                        onChange={(event) => setRecurrenceFrequency(event.target.value as ExpenseRecurrence)}
                        className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Next Due</span>
                      <input
                        type="date"
                        value={nextDueDate}
                        onChange={(event) => setNextDueDate(event.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </label>
                  </>
                )}
                <label className="block md:col-span-2">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                    placeholder="Optional notes"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsAddingExpense(false); resetExpenseForm(); }}
                  className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingExpense}
                  className="px-5 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Save className="h-4 w-4" />
                  {isSavingExpense ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4">
          <div className="rounded-2xl shadow-2xl px-5 py-4 bg-green-600 text-white flex items-center gap-3">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-bold">{successMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
