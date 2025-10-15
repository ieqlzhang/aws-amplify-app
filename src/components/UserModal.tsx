import React, { useState, useEffect } from 'react';
import { UserProfile } from '../App';

interface UserModalProps {
  user: UserProfile | null;
  onSave: (userData: Omit<UserProfile, 'userId'> & { userId?: string }) => void;
  onCancel: () => void;
}

const UserModal: React.FC<UserModalProps> = ({ user, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    userId: '',
    email: '',
    salesOrganizations: [] as string[],
    allowedCountryPols: [] as string[],
    permissions: [] as string[],
    isActive: false,
  });

  const [newSalesOrg, setNewSalesOrg] = useState('');
  const [newCountryPol, setNewCountryPol] = useState('');
  const [newPermission, setNewPermission] = useState('');

  useEffect(() => {
    if (user) {
      setFormData({
        userId: user.userId,
        email: user.email || '',
        salesOrganizations: (user.salesOrganizations || []).filter((org): org is string => org !== null),
        allowedCountryPols: (user.allowedCountryPols || []).filter((country): country is string => country !== null),
        permissions: (user.permissions || []).filter((perm): perm is string => perm !== null),
        isActive: user.isActive || false,
      });
    }
  }, [user]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const addSalesOrg = () => {
    if (newSalesOrg.trim() && !formData.salesOrganizations.includes(newSalesOrg.trim())) {
      setFormData(prev => ({
        ...prev,
        salesOrganizations: [...prev.salesOrganizations, newSalesOrg.trim()],
      }));
      setNewSalesOrg('');
    }
  };

  const removeSalesOrg = (org: string) => {
    setFormData(prev => ({
      ...prev,
      salesOrganizations: prev.salesOrganizations.filter(o => o !== org),
    }));
  };

  const addCountryPol = () => {
    if (newCountryPol.trim() && !formData.allowedCountryPols.includes(newCountryPol.trim())) {
      setFormData(prev => ({
        ...prev,
        allowedCountryPols: [...prev.allowedCountryPols, newCountryPol.trim()],
      }));
      setNewCountryPol('');
    }
  };

  const removeCountryPol = (country: string) => {
    setFormData(prev => ({
      ...prev,
      allowedCountryPols: prev.allowedCountryPols.filter(c => c !== country),
    }));
  };

  const addPermission = () => {
    if (newPermission.trim() && !formData.permissions.includes(newPermission.trim())) {
      setFormData(prev => ({
        ...prev,
        permissions: [...prev.permissions, newPermission.trim()],
      }));
      setNewPermission('');
    }
  };

  const removePermission = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.filter(p => p !== permission),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const commonPermissions = [
    'orders:read',
    'orders:write',
    'orders:delete',
    'users:read',
    'users:write',
    'admin:access',
  ];

  const commonSalesOrgs = ['NL20', '1S20', 'DE10', 'FR10'];
  const commonCountries = ['CN', 'TH', 'VN', 'ID', 'MY', 'SG'];

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>{user ? 'Edit User Profile' : 'Create New User Profile'}</h3>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="userId">User ID *</label>
            <input
              type="text"
              id="userId"
              name="userId"
              value={formData.userId}
              onChange={handleInputChange}
              required
              disabled={!!user}
              placeholder="e.g., user123, john.doe"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="user@example.com"
            />
          </div>

          <div className="form-group">
            <label>Sales Organizations</label>
            <div className="tags">
              {formData.salesOrganizations.map((org, index) => (
                <span key={index} className="tag">
                  {org}
                  <button 
                    type="button" 
                    onClick={() => removeSalesOrg(org)}
                    style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <select
                value={newSalesOrg}
                onChange={(e) => setNewSalesOrg(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Select common org...</option>
                {commonSalesOrgs.map(org => (
                  <option key={org} value={org}>{org}</option>
                ))}
              </select>
              <input
                type="text"
                value={newSalesOrg}
                onChange={(e) => setNewSalesOrg(e.target.value)}
                placeholder="Or type custom org"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={addSalesOrg} className="btn btn-secondary">
                Add
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Allowed Country POLs</label>
            <div className="tags">
              {formData.allowedCountryPols.map((country, index) => (
                <span key={index} className="tag">
                  {country}
                  <button 
                    type="button" 
                    onClick={() => removeCountryPol(country)}
                    style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <select
                value={newCountryPol}
                onChange={(e) => setNewCountryPol(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Select common country...</option>
                {commonCountries.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
              <input
                type="text"
                value={newCountryPol}
                onChange={(e) => setNewCountryPol(e.target.value)}
                placeholder="Or type country code"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={addCountryPol} className="btn btn-secondary">
                Add
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Permissions</label>
            <div className="tags">
              {formData.permissions.map((permission, index) => (
                <span key={index} className="tag">
                  {permission}
                  <button 
                    type="button" 
                    onClick={() => removePermission(permission)}
                    style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <select
                value={newPermission}
                onChange={(e) => setNewPermission(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Select common permission...</option>
                {commonPermissions.map(perm => (
                  <option key={perm} value={perm}>{perm}</option>
                ))}
              </select>
              <input
                type="text"
                value={newPermission}
                onChange={(e) => setNewPermission(e.target.value)}
                placeholder="Or type custom permission"
                style={{ flex: 1 }}
              />
              <button type="button" onClick={addPermission} className="btn btn-secondary">
                Add
              </button>
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                name="isActive"
                checked={formData.isActive}
                onChange={handleInputChange}
              />
              Active User
            </label>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onCancel} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {user ? 'Update' : 'Create'} User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserModal;
