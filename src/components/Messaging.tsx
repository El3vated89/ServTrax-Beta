import React, { useState, useEffect } from 'react';
import { MessageSquare, Plus, Trash2, Edit2, Save, X, ChevronRight, Info, Smartphone, Mail, BellRing, Send } from 'lucide-react';
import { templateService, MessageTemplate } from '../services/templateService';
import { platformMessagingService, PlatformMessagingConfig } from '../services/platformMessagingService';
import { messageDeliveryService, MessageDeliveryRecord } from '../services/messageDeliveryService';

export default function Messaging() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [providerConfig, setProviderConfig] = useState<PlatformMessagingConfig>(platformMessagingService.getDefaultConfig());
  const [deliveries, setDeliveries] = useState<MessageDeliveryRecord[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', content: '' });
  const [deliveryChannel, setDeliveryChannel] = useState<'sms' | 'email'>('sms');
  const [deliveryRecipient, setDeliveryRecipient] = useState('');
  const [deliveryRecipientLabel, setDeliveryRecipientLabel] = useState('');
  const [deliveryTemplateId, setDeliveryTemplateId] = useState('');
  const [deliverySubject, setDeliverySubject] = useState('ServTrax Update');
  const [deliveryBody, setDeliveryBody] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = templateService.subscribeToTemplates(setTemplates);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = platformMessagingService.subscribeToConfig(setProviderConfig);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = messageDeliveryService.subscribeToDeliveries(setDeliveries);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(() => {
    const selectedTemplate = templates.find((template) => template.id === deliveryTemplateId);
    if (selectedTemplate) {
      setDeliveryBody(selectedTemplate.content);
    }
  }, [deliveryTemplateId, templates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      if (editingId) {
        await templateService.updateTemplate(editingId, formData);
        setEditingId(null);
        setSuccessMessage('Template updated successfully.');
      } else {
        await templateService.addTemplate(formData);
        setIsAdding(false);
        setSuccessMessage('Template saved successfully.');
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
    setSuccessMessage(null);
  };

  const handleDelete = async (id: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await templateService.deleteTemplate(id);
      setConfirmDeleteId(null);
      setSuccessMessage('Template deleted successfully.');
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

  const handleSendDelivery = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const selectedTemplate = templates.find((template) => template.id === deliveryTemplateId);
    if (!deliveryRecipient.trim()) {
      setErrorMessage(`A ${deliveryChannel === 'sms' ? 'phone number' : 'recipient email'} is required.`);
      return;
    }

    if (!deliveryBody.trim()) {
      setErrorMessage('Message body is required.');
      return;
    }

    try {
      await messageDeliveryService.sendMessage({
        channel: deliveryChannel,
        recipient: deliveryRecipient.trim(),
        recipient_label: deliveryRecipientLabel.trim() || deliveryRecipient.trim(),
        template_id: selectedTemplate?.id,
        template_name: selectedTemplate?.name,
        subject: deliveryChannel === 'email' ? deliverySubject.trim() : undefined,
        body: deliveryBody.trim(),
      }, providerConfig);

      setDeliveryRecipient('');
      setDeliveryRecipientLabel('');
      setDeliveryTemplateId('');
      setDeliveryBody('');
      setSuccessMessage(deliveryChannel === 'sms' ? 'SMS delivery logged.' : 'Email delivery logged.');
    } catch (error) {
      console.error('Error logging delivery:', error);
      setErrorMessage('Failed to create delivery record.');
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

      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3 text-green-700">
          <Info className="h-5 w-5 shrink-0" />
          <p className="text-sm font-bold">{successMessage}</p>
        </div>
      )}

      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-gray-900">Messaging Foundation</h3>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
              In-app notifications plus provider-ready SMS and email
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-3xl bg-gray-50 border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-black text-gray-900">SMS</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">Twilio</p>
              </div>
            </div>
            <p className="text-sm font-bold text-gray-500 mt-4">
              {providerConfig.sms_enabled ? 'SMS foundation is enabled and ready for secure API hookup.' : 'SMS foundation is laid out and waiting for secure API hookup.'}
            </p>
          </div>

          <div className="rounded-3xl bg-gray-50 border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-black text-gray-900">Email</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">SendGrid</p>
              </div>
            </div>
            <p className="text-sm font-bold text-gray-500 mt-4">
              {providerConfig.email_enabled ? 'Email foundation is enabled and ready for secure API hookup.' : 'Email foundation is laid out and waiting for secure API hookup.'}
            </p>
          </div>

          <div className="rounded-3xl bg-gray-50 border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <BellRing className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-black text-gray-900">Notifications</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">In-App</p>
              </div>
            </div>
            <p className="text-sm font-bold text-gray-500 mt-4">
              {providerConfig.in_app_notifications_enabled ? 'In-app notifications are active as the shared alert foundation.' : 'In-app notification foundation is available and can be re-enabled.'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-gray-900">Delivery Layers</h3>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
              Templates stay central while SMS and email flow through the same messaging system
            </p>
          </div>
        </div>

        <form onSubmit={handleSendDelivery} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Channel</span>
              <select
                value={deliveryChannel}
                onChange={(event) => setDeliveryChannel(event.target.value as 'sms' | 'email')}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Template</span>
              <select
                value={deliveryTemplateId}
                onChange={(event) => setDeliveryTemplateId(event.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
              >
                <option value="">Custom / No Template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">
                {deliveryChannel === 'sms' ? 'Phone Number' : 'Email Address'}
              </span>
              <input
                type={deliveryChannel === 'sms' ? 'text' : 'email'}
                value={deliveryRecipient}
                onChange={(event) => setDeliveryRecipient(event.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                placeholder={deliveryChannel === 'sms' ? '+1...' : 'customer@example.com'}
              />
            </label>
            <label className="block">
              <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Recipient Label</span>
              <input
                type="text"
                value={deliveryRecipientLabel}
                onChange={(event) => setDeliveryRecipientLabel(event.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                placeholder="Customer name"
              />
            </label>
            {deliveryChannel === 'email' && (
              <label className="block md:col-span-2">
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Subject</span>
                <input
                  type="text"
                  value={deliverySubject}
                  onChange={(event) => setDeliverySubject(event.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                />
              </label>
            )}
            <label className="block md:col-span-2">
              <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 mb-2">Message Body</span>
              <textarea
                rows={5}
                value={deliveryBody}
                onChange={(event) => setDeliveryBody(event.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-4 px-5 text-sm font-bold text-gray-900 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none"
                placeholder="Message content"
              />
            </label>
          </div>

          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Delivery Status</p>
            <p className="text-sm font-bold text-gray-500 mt-2">
              Twilio and SendGrid routing is logged here now. Live provider execution still requires a secure server endpoint before messages can be sent for real.
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-gray-900 text-white py-4 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
          >
            <Send className="h-5 w-5" />
            Log Delivery
          </button>
        </form>
      </div>

      <div className="bg-white rounded-[32px] p-6 shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-gray-900">Delivery Log</h3>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
              Shared delivery history for future SMS and email usage tracking
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {deliveries.length === 0 ? (
            <p className="text-sm font-bold text-gray-400">No delivery records yet.</p>
          ) : (
            [...deliveries]
              .sort((left, right) => {
                const leftDate = left.created_at?.toDate ? left.created_at.toDate().getTime() : 0;
                const rightDate = right.created_at?.toDate ? right.created_at.toDate().getTime() : 0;
                return rightDate - leftDate;
              })
              .slice(0, 10)
              .map((delivery) => (
                <div key={delivery.id} className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-gray-900">{delivery.recipient_label}</p>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-2">
                        {delivery.channel} • {delivery.provider} • {delivery.recipient}
                      </p>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${
                      delivery.status === 'sent'
                        ? 'bg-green-100 text-green-700'
                        : delivery.status === 'queued'
                        ? 'bg-blue-100 text-blue-700'
                        : delivery.status === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {delivery.status}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-gray-500 mt-3">{delivery.error_message || delivery.body}</p>
                </div>
              ))
          )}
        </div>
      </div>

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
            <button
              onClick={() => {
                setIsAdding(true);
                setEditingId(null);
                setFormData({ name: '', content: '' });
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className="mt-6 bg-blue-600 text-white px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
            >
              Create First Template
            </button>
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
