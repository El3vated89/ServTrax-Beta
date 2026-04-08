import React, { useState, useEffect } from 'react';
import { Plus, X, Settings, Trash2, Wrench, Calendar, FileText } from 'lucide-react';
import { equipmentService, Equipment } from '../services/equipmentService';

export default function Equip() {
  const [equipmentList, setEquipmentList] = useState<Equipment[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [notes, setNotes] = useState('');
  
  // Service History Form
  const [isAddingService, setIsAddingService] = useState(false);
  const [serviceDate, setServiceDate] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');

  useEffect(() => {
    const unsubscribeEquip = equipmentService.subscribeToEquipment((data) => {
      setEquipmentList(data);
    });
    return () => {
      unsubscribeEquip();
    };
  }, []);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (editingEquipment && editingEquipment.id) {
        await equipmentService.updateEquipment(editingEquipment.id, {
          name,
          brand,
          model,
          serial_number: serialNumber,
          part_number: partNumber,
          notes
        });
        setEditingEquipment(null);
        setSuccessMessage('Equipment updated successfully.');
      } else {
        await equipmentService.addEquipment({
          name,
          brand,
          model,
          serial_number: serialNumber,
          part_number: partNumber,
          notes,
          service_history: []
        });
        setIsAdding(false);
        setSuccessMessage('Equipment saved successfully.');
      }
      resetForm();
    } catch (error) {
      console.error('Error saving equipment:', error);
      setErrorMessage('Failed to save equipment.');
    }
  };

  const handleAddServiceRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEquipment || !editingEquipment.id) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    
    try {
      const newHistory = [
        ...(editingEquipment.service_history || []),
        { date: serviceDate, description: serviceDescription }
      ];
      
      await equipmentService.updateEquipment(editingEquipment.id, {
        service_history: newHistory
      });
      
      setEditingEquipment({
        ...editingEquipment,
        service_history: newHistory
      });
      
      setIsAddingService(false);
      setServiceDate('');
      setServiceDescription('');
      setSuccessMessage('Service record added successfully.');
    } catch (error) {
      console.error('Error adding service record:', error);
      setErrorMessage('Failed to save the service record.');
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteEquipment = async (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await equipmentService.deleteEquipment(confirmDeleteId);
      setConfirmDeleteId(null);
      setSuccessMessage('Equipment deleted successfully.');
    } catch (error) {
      console.error('Error deleting equipment:', error);
      setErrorMessage('Failed to delete equipment.');
    }
  };

  const openEditModal = (equip: Equipment) => {
    setEditingEquipment(equip);
    setName(equip.name);
    setBrand(equip.brand || '');
    setModel(equip.model || '');
    setSerialNumber(equip.serial_number || '');
    setPartNumber(equip.part_number || '');
    setNotes(equip.notes || '');
  };

  const resetForm = () => {
    setName('');
    setBrand('');
    setModel('');
    setSerialNumber('');
    setPartNumber('');
    setNotes('');
  };

  const closeEditModal = () => {
    setEditingEquipment(null);
    setIsAdding(false);
    setIsAddingService(false);
    resetForm();
  };

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end px-2">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Equipment</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Track and service your business equipment</p>
        </div>
      </header>

      {errorMessage && (
        <div className="mx-2 bg-red-50 border border-red-100 p-4 rounded-2xl">
          <p className="text-sm font-bold text-red-700">{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div className="mx-2 bg-green-50 border border-green-100 p-4 rounded-2xl">
          <p className="text-sm font-bold text-green-700">{successMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {equipmentList.length === 0 ? (
          <div className="col-span-full bg-gray-50 rounded-3xl p-16 text-center border-2 border-dashed border-gray-200">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">No equipment found</p>
          </div>
        ) : (
          equipmentList.map(equip => {
            return (
              <div key={equip.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center font-black text-lg text-blue-600">
                      <Wrench className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-gray-900 leading-tight">{equip.name}</h3>
                      {equip.brand && (
                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-0.5">{equip.brand} {equip.model}</p>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteEquipment(equip.id!)}
                    className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Serial Number</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{equip.serial_number || 'N/A'}</p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-2xl">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Part Number</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{equip.part_number || 'N/A'}</p>
                  </div>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-50 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></div>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                      {equip.service_history?.length || 0} Records
                    </span>
                  </div>
                  <button 
                    onClick={() => openEditModal(equip)}
                    className="py-2 px-4 bg-gray-50 text-gray-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600 transition-all flex items-center gap-2"
                  >
                    Manage
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add/Edit Equipment Modal */}
      {(isAdding || editingEquipment) && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[70] flex justify-center items-center p-2 sm:p-4">
          <div className="bg-white w-full h-[95vh] sm:h-auto sm:max-w-4xl rounded-3xl p-8 overflow-y-auto shadow-2xl relative">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                  {editingEquipment ? 'Manage Equipment' : 'Add Equipment'}
                </h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Equipment specifications and history</p>
              </div>
              <button onClick={closeEditModal} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              {/* Left Column: Details Form */}
              <div className="space-y-6">
                <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] mb-4">Specifications</h4>
                <form onSubmit={handleAddEquipment} className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Equipment Name/Type</label>
                    <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. HVAC Unit, Lawnmower" className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Brand</label>
                      <input type="text" value={brand} onChange={e => setBrand(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Model</label>
                      <input type="text" value={model} onChange={e => setModel(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Serial Number</label>
                      <input type="text" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Part Number</label>
                      <input type="text" value={partNumber} onChange={e => setPartNumber(e.target.value)} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full bg-gray-50 border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                  </div>
                  <div className="pt-4">
                    <button type="submit" className="w-full bg-blue-600 text-white py-5 px-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95">
                      {editingEquipment ? 'Update Details' : 'Save Equipment'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: Service History (Only visible when editing) */}
              {editingEquipment && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center border-b border-gray-50 pb-4">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Service History</h4>
                    <button 
                      onClick={() => setIsAddingService(!isAddingService)}
                      className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-all flex items-center gap-2"
                    >
                      {isAddingService ? 'Cancel' : <><Plus className="h-3 w-3" /> Add Record</>}
                    </button>
                  </div>

                  {isAddingService && (
                    <form onSubmit={handleAddServiceRecord} className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Service Date</label>
                        <input type="date" required value={serviceDate} onChange={e => setServiceDate(e.target.value)} className="w-full bg-white border-gray-200 rounded-2xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Description of Service</label>
                        <textarea required value={serviceDescription} onChange={e => setServiceDescription(e.target.value)} rows={2} placeholder="What work was performed?" className="w-full bg-white border-gray-200 rounded-2xl py-3 px-4 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" />
                      </div>
                      <button type="submit" className="w-full bg-blue-600 text-white py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all">
                        Save Record
                      </button>
                    </form>
                  )}

                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {(!editingEquipment.service_history || editingEquipment.service_history.length === 0) ? (
                      <div className="text-center py-12 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No service history recorded</p>
                      </div>
                    ) : (
                      [...editingEquipment.service_history].reverse().map((record, idx) => (
                        <div key={idx} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                          <div className="flex items-center gap-2 text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">
                            <Calendar className="h-3 w-3" />
                            {new Date(record.date).toLocaleDateString()}
                          </div>
                          <p className="text-sm font-bold text-gray-900 leading-relaxed">{record.description}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button 
        onClick={() => setIsAdding(true)}
        className="fixed bottom-24 right-6 sm:bottom-12 sm:right-12 bg-blue-600 text-white rounded-3xl p-5 shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:scale-110 transition-all z-30 group active:scale-95"
      >
        <Plus className="h-8 w-8 group-hover:rotate-90 transition-transform duration-300" />
      </button>
      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[300] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="h-10 w-10" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Delete Equipment?</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 uppercase tracking-widest leading-relaxed">
              This action cannot be undone. Are you sure you want to delete this equipment record?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-4 bg-red-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-red-700 shadow-xl shadow-red-100 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
