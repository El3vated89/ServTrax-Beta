import React, { useState, useEffect } from 'react';
import { MessageSquare, Plus, Trash2, Edit2, Save, X, ChevronRight, Info } from 'lucide-react';
import { templateService, MessageTemplate } from '../services/templateService';

export default function Messaging() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', content: '' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = templateService.subscribeToTemplates(setTemplates);
    return () => unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      if (editingId) {
        await templateService.updateTemplate(editingId, formData);
        setEditingId(null);
      } else {
        await templateService.addTemplate(formData);
        setIsAdding(false);
      }
      setFormData({ name: '', content: '' });
    } catch (error: any) {
      console.error('Error saving template:', error);
      let msg = 'Failed to save template. Please check your permissions.';
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) msg = `Save failed: ${parsed.error}`;
      } catch (e) {}
      setErrorMessage(msg);
    }
  };

  const handleEdit = (template: MessageTemplate) => {
    setEditingId(template.id!);
    setFormData({ name: template.name, content: template.content });
    setIsAdding(true);
    setErrorMessage(null);
  };

  const handleDelete = async (id: string) => {
    setErrorMessage(null);
    try {
      await templateService.deleteTemplate(id);
      setConfirmDeleteId(null);
    } catch (error: any) {
      console.error('Error deleting template:', error);
      let msg = 'Failed to delete template.';
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) msg = `Delete failed: ${parsed.error}`;
      } catch (e) {}
      setErrorMessage(msg);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Messaging Templates</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Manage your proof sharing messages</p>
        </div>
        <button
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            setFormData({ name: '', content: '' });
            setErrorMessage(null);
          }}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2 shadow-lg shadow-blue-100"
        >
          <Plus className="h-5 w-5" />
          New Template
        </button>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700">
          <Info className="h-5 w-5 shrink-0" />
          <p className="text-sm font-bold">{errorMessage}</p>
        </div>
      )}

      {isAdding && (
        <div className="bg-white rounded-[32px] p-8 shadow-xl border border-gray-100 mb-8 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-gray-900">{editingId ? 'Edit Template' : 'Create Template'}</h3>
            <button onClick={() => setIsAdding(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors">
              <X className="h-6 w-6" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Template Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Standard Completion"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Message Content</label>
              <textarea
                required
                rows={4}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="Hi {customer}, your service is complete! View proof here: {link}"
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none"
              />
              <div className="mt-3 flex items-start gap-2 p-3 bg-blue-50 rounded-xl">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <p className="text-[10px] font-bold text-blue-700 leading-relaxed">
                  Use <code className="bg-blue-100 px-1 rounded">{"{customer}"}</code> for customer name and <code className="bg-blue-100 px-1 rounded">{"{link}"}</code> for the proof URL.
                </p>
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-gray-900 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
            >
              <Save className="h-5 w-5" />
              {editingId ? 'Update Template' : 'Save Template'}
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {templates.length === 0 && !isAdding ? (
          <div className="text-center py-20 bg-white rounded-[40px] border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="h-8 w-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-black text-gray-900">No templates yet</h3>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Create your first messaging template</p>
          </div>
        ) : (
          templates.map((template) => (
            <div key={template.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-lg font-black text-gray-900">{template.name}</h4>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Created {template.created_at ? new Date(template.created_at.toDate()).toLocaleDateString() : 'Just now'}
                  </p>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleEdit(template)}
                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(template.id!)}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <p className="text-sm font-medium text-gray-600 whitespace-pre-wrap leading-relaxed italic">
                  "{template.content}"
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[300] flex justify-center items-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] p-8 text-center shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trash2 className="h-10 w-10" />
            </div>
            <h3 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">Delete Template?</h3>
            <p className="text-sm font-bold text-gray-500 mb-8 uppercase tracking-widest leading-relaxed">
              This action cannot be undone. Are you sure?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-4 bg-gray-100 text-gray-900 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDelete(confirmDeleteId)}
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
