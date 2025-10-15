import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import { useAuthenticator } from '@aws-amplify/ui-react';
import type { Schema } from '../amplify/data/resource';
import UserList from './components/UserList';
import UserModal from './components/UserModal';

const client = generateClient<Schema>();

export interface UserProfile {
  userId: string;
  email?: string | null;
  salesOrganizations?: (string | null)[] | null;
  allowedCountryPols?: (string | null)[] | null;
  permissions?: (string | null)[] | null;
  isActive?: boolean | null;
  owner?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function App() {
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await client.models.UserProfile.list();
      
      if (response.data) {
        setUsers(response.data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to fetch users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setShowModal(true);
  };

  const handleEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setShowModal(true);
  };

  const handleSaveUser = async (userData: Omit<UserProfile, 'userId'> & { userId?: string }) => {
    try {
      setError(null);
      setSuccess(null);

      if (editingUser) {
        // Update existing user
        await client.models.UserProfile.update({
          userId: editingUser.userId,
          ...userData,
        });
        setSuccess('User profile updated successfully!');
      } else {
        // Create new user
        if (!userData.userId) {
          setError('User ID is required for new users.');
          return;
        }
        
        await client.models.UserProfile.create({
          userId: userData.userId,
          email: userData.email,
          salesOrganizations: userData.salesOrganizations,
          allowedCountryPols: userData.allowedCountryPols,
          permissions: userData.permissions,
          isActive: userData.isActive ?? false,
        });
        setSuccess('User profile created successfully!');
      }

      setShowModal(false);
      setEditingUser(null);
      await fetchUsers();
    } catch (err) {
      console.error('Error saving user:', err);
      setError('Failed to save user profile. Please try again.');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user profile?')) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      await client.models.UserProfile.delete({ userId });
      setSuccess('User profile deleted successfully!');
      await fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      setError('Failed to delete user profile. Please try again.');
    }
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="container">
      <div className="header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>Admin Dashboard</h1>
            <p>Welcome, {user?.signInDetails?.loginId || 'Admin'}</p>
          </div>
          <button onClick={signOut} className="btn btn-secondary">
            Sign Out
          </button>
        </div>
      </div>

      {error && (
        <div className="error">
          {error}
          <button 
            onClick={clearMessages}
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="success">
          {success}
          <button 
            onClick={clearMessages}
            style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}

      <div className="users-section">
        <div className="users-header">
          <h2>User Profiles ({users.length})</h2>
          <button onClick={handleCreateUser} className="btn btn-primary">
            Create New User
          </button>
        </div>

        <UserList
          users={users}
          loading={loading}
          onEditUser={handleEditUser}
          onDeleteUser={handleDeleteUser}
          onRefresh={fetchUsers}
        />
      </div>

      {showModal && (
        <UserModal
          user={editingUser}
          onSave={handleSaveUser}
          onCancel={() => {
            setShowModal(false);
            setEditingUser(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
