import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Package, Plus, Save, X } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { supplyService, SupplyRecord } from '../services/supplyService';
import { savePipelineService } from '../services/savePipelineService';

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

export default function Supplies() {
  const [supplies, setSupplies] = useState<SupplyRecord[]>([]);
  const [isAddingSupply, setIsAddingSupply] = useState(false);
  const [isSavingSupply, setIsSavingSupply] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('units');
  const [quantityOnHand, setQuantityOnHand] = useState('');
  const [reorderThreshold, setReorderThreshold] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const unsubscribe = supplyService.subscribeToSupplies(setSupplies);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const lowStockSupplies = useMemo(
    () => supplies.filter((supply) => supply.active && supply.quantity_on_hand <= supply.reorder_threshold),
    [supplies]
  );

  const resetSupplyForm = () => {
    setName('');
    setCategory('');
    setUnit('units');
    setQuantityOnHand('');
    setReorderThreshold('');
    setVendor('');
    setNotes('');
  };

  const handleSaveSupply = async (event: React.FormEvent) => {
    event.preventDefault();
    const debugContext = {
      flow: 'supplies-save',
      traceId: savePipelineService.createTraceId('supplies-save'),
    };

    setErrorMessage(null);
    setIsSavingSupply(true);
    savePipelineService.log(debugContext, 'save_started');

    const parsedQuantity = Number(quantityOnHand || 0);
    const parsedThreshold = Number(reorderThreshold || 0);

    if (!name.trim()) {
      savePipelineService.log(debugContext, 'validation_failed', 'Supply name is required.');
      setErrorMessage('Supply name is required.');
      setIsSavingSupply(false);
      savePipelineService.log(debugContext, 'loading_state_cleared');
      return;
    }

    try {
      savePipelineService.log(debugContext, 'validation_passed');
      savePipelineService.log(debugContext, 'service_called', 'supplyService.addSupply');
      await savePipelineService.withTimeout(
        supplyService.addSupply({
          name: name.trim(),
          category: category.trim(),
          unit: unit.trim() || 'units',
          quantity_on_hand: parsedQuantity,
          reorder_threshold: parsedThreshold,
          vendor: vendor.trim(),
          notes: notes.trim(),
          active: true,
          last_restocked_at: parsedQuantity > 0 ? Timestamp.now() : null,
          last_used_at: null,
        }, debugContext),
        {
          timeoutMessage: 'Saving the supply took too long. Please try again.',
          debugContext,
        }
      );

      resetSupplyForm();
      setIsAddingSupply(false);
      setSuccessMessage('Supply saved');
      savePipelineService.log(debugContext, 'ui_success_handler_fired');
    } catch (error) {
      console.error('Error saving supply:', error);
      savePipelineService.logError(debugContext, 'db_write_failed', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save supply.');
    } finally {
      setIsSavingSupply(false);
      savePipelineService.log(debugContext, 'loading_state_cleared');
    }
  };

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Supplies</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Consumables and reorder tracking</p>
        </div>
        <button
          onClick={() => setIsAddingSupply(true)}
          className="px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Supply
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
          <Package className="h-6 w-6 mb-4 text-blue-100" />
          <p className="text-3xl font-black">{supplies.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Total Supplies</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <AlertCircle className="h-6 w-6 mb-4 text-amber-500" />
          <p className="text-3xl font-black text-gray-900">{lowStockSupplies.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Low Stock</p>
        </div>
      </div>

      <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
        <h3 className="text-lg font-black text-gray-900 mb-6">Supply List</h3>
        <div className="space-y-3">
          {supplies.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center">
              <p className="text-sm font-black text-gray-900">No supplies tracked yet</p>
              <p className="text-xs font-bold text-gray-500 mt-2">Add consumables like fertilizer, string, chemicals, mulch, and gloves here.</p>
            </div>
          ) : (
            [...supplies]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((supply) => (
                <div key={supply.id} className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-gray-900">{supply.name}</p>
                      {supply.quantity_on_hand <= supply.reorder_threshold && (
                        <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-amber-100 text-amber-700">
                          Reorder
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      {supply.category || 'General'} • {supply.vendor || 'No vendor'} • Last restock {toDate(supply.last_restocked_at)?.toLocaleDateString() || 'N/A'}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-sm font-black text-blue-600">{supply.quantity_on_hand} {supply.unit}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      Reorder at {supply.reorder_threshold} {supply.unit}
                    </p>
                  </div>
                </div>
              ))
          )}
        </div>
      </section>

      {isAddingSupply && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-gray-900/50 p-0 sm:p-4">
          <div className="bg-white rounded-t-[32px] sm:rounded-[32px] w-full max-w-2xl max-h-[calc(100dvh-0.5rem)] sm:max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 bg-white">
              <div>
                <h3 className="text-xl font-black text-gray-900">New Supply</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Separate consumables from equipment</p>
              </div>
              <button onClick={() => { setIsAddingSupply(false); resetSupplyForm(); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSaveSupply} className="flex-1 overflow-y-auto p-8 pb-[calc(7rem+env(safe-area-inset-bottom))] space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block md:col-span-2">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Name</span>
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Fertilizer"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Category</span>
                  <input
                    type="text"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Chemicals"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Unit</span>
                  <input
                    type="text"
                    value={unit}
                    onChange={(event) => setUnit(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="bags"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Quantity On Hand</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={quantityOnHand}
                    onChange={(event) => setQuantityOnHand(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Reorder Threshold</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={reorderThreshold}
                    onChange={(event) => setReorderThreshold(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Vendor</span>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(event) => setVendor(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Vendor or supplier"
                  />
                </label>
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
                  onClick={() => { setIsAddingSupply(false); resetSupplyForm(); }}
                  disabled={isSavingSupply}
                  className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupply}
                  className={`px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                    isSavingSupply ? 'bg-gray-200 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Save className="h-4 w-4" />
                  {isSavingSupply ? 'Saving...' : 'Save Supply'}
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
