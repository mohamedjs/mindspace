import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteOwnAccount, fetchProfile, updateDisplayName } from '../api/account.api';

const PROFILE_KEY = ['account', 'profile'] as const;

export function useProfile() {
  return useQuery({ queryKey: PROFILE_KEY, queryFn: fetchProfile });
}

export function useUpdateDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateDisplayName,
    onSuccess: () => qc.invalidateQueries({ queryKey: PROFILE_KEY }),
  });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: deleteOwnAccount });
}
