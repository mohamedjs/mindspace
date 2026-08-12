'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteUserKey, fetchUserKeys, saveUserKey } from '../api/keys.api';

const USER_KEYS_QUERY_KEY = ['byok', 'keys'] as const;

export function useUserKeys() {
  return useQuery({
    queryKey: USER_KEYS_QUERY_KEY,
    queryFn: fetchUserKeys,
  });
}

export function useSaveUserKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveUserKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: USER_KEYS_QUERY_KEY }),
  });
}

export function useDeleteUserKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteUserKey,
    onSuccess: () => qc.invalidateQueries({ queryKey: USER_KEYS_QUERY_KEY }),
  });
}
