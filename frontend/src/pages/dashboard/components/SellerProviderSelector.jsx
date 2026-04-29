import React, { useState, useEffect } from 'react';
import { adminApi } from '../../../services/api';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Search, User, Check, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { ScrollArea } from '../../../components/ui/scroll-area';

const SellerProviderSelector = ({ onSelect, selectedId, role = 'all' }) => {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const params = { 
          search, 
          role: role === 'all' ? undefined : role,
          limit: 10
        };
        const response = await adminApi.getAllUsers(params);
        setUsers(response.data?.users || response.users || []);
      } catch (err) {
        console.error('Error fetching users:', err);
        setError('Failed to load users');
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(() => {
      if (search.length >= 2 || search.length === 0) {
        fetchUsers();
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [search, role]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <ScrollArea className="h-[200px] rounded-md border p-4">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        
        {!loading && users.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No users found matching your search.
          </div>
        )}

        <div className="space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              onClick={() => onSelect(user)}
              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                selectedId === user.id 
                  ? 'bg-primary/10 border-primary border' 
                  : 'hover:bg-accent border-transparent border'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                  <User className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {user.name}
                    {user.businessName && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded text-muted-foreground">
                        {user.businessName}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {user.email} • {user.role}
                  </div>
                </div>
              </div>
              {selectedId === user.id && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export default SellerProviderSelector;
