import React from 'react';
import { UserProfile } from '../App';

interface UserListProps {
  users: UserProfile[];
  loading: boolean;
  onEditUser: (user: UserProfile) => void;
  onDeleteUser: (userId: string) => void;
  onRefresh: () => void;
}

const UserList: React.FC<UserListProps> = ({
  users,
  loading,
  onEditUser,
  onDeleteUser,
  onRefresh,
}) => {
  if (loading) {
    return <div className="loading">Loading users...</div>;
  }

  if (users.length === 0) {
    return (
      <div className="loading">
        <p>No users found.</p>
        <button onClick={onRefresh} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div>
      <table className="users-table">
        <thead>
          <tr>
            <th>User ID</th>
            <th>Email</th>
            <th>Sales Organizations</th>
            <th>Country POLs</th>
            <th>Permissions</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.userId}>
              <td>{user.userId}</td>
              <td>{user.email || '-'}</td>
              <td>
                {user.salesOrganizations && user.salesOrganizations.length > 0 ? (
                  <div className="tags">
                    {user.salesOrganizations
                      .filter((org): org is string => org !== null)
                      .map((org, index) => (
                        <span key={index} className="tag">
                          {org}
                        </span>
                      ))}
                  </div>
                ) : (
                  '-'
                )}
              </td>
              <td>
                {user.allowedCountryPols && user.allowedCountryPols.length > 0 ? (
                  <div className="tags">
                    {user.allowedCountryPols
                      .filter((country): country is string => country !== null)
                      .map((country, index) => (
                        <span key={index} className="tag">
                          {country}
                        </span>
                      ))}
                  </div>
                ) : (
                  '-'
                )}
              </td>
              <td>
                {user.permissions && user.permissions.length > 0 ? (
                  <div className="tags">
                    {user.permissions
                      .filter((permission): permission is string => permission !== null)
                      .map((permission, index) => (
                        <span key={index} className="tag">
                          {permission}
                        </span>
                      ))}
                  </div>
                ) : (
                  '-'
                )}
              </td>
              <td>
                <span className={`tag ${user.isActive ? 'active' : 'inactive'}`}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => onEditUser(user)}
                    className="btn btn-secondary"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDeleteUser(user.userId)}
                    className="btn btn-danger"
                    style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div style={{ marginTop: '1rem', textAlign: 'right' }}>
        <button onClick={onRefresh} className="btn btn-secondary">
          Refresh List
        </button>
      </div>
    </div>
  );
};

export default UserList;
