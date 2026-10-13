import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import PasswordField from '../components/PasswordField.jsx';
import {
  savePreferences,
  getLearnerProfileSummary,
  saveLearnerProfile, saveLearnerProfileSummary,
} from '../../js/storage.js';
import { updateProfile, getMyFields } from '../../js/auth.js';
import { missingRequired, pickValues } from '../lib/userFields.js';
import CustomFieldInput from '../components/CustomFieldInput.jsx';
import * as orchestrator from '../../js/orchestrator.js';
import { syncInBackground } from '../lib/syncDebounce.js';
import { ensureProfileExists, mergeProfile } from '../lib/profileQueue.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

export default function Settings() {
  const { state, dispatch } = useApp();
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || state.preferences?.name || '');
  const [username, setUsername] = useState(user?.username || '');
  const [profileSummary, setProfileSummary] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordFeedback, setPasswordFeedback] = useState(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [nameFeedback, setNameFeedback] = useState(null);
  const [nameSubmitting, setNameSubmitting] = useState(false);
  const [usernameFeedback, setUsernameFeedback] = useState(null);
  const [usernameSubmitting, setUsernameSubmitting] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [userFields, setUserFields] = useState([]);
  const [fieldValues, setFieldValues] = useState({});
  const [fieldsFeedback, setFieldsFeedback] = useState(null);
  const [fieldsSaving, setFieldsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setProfileSummary(await getLearnerProfileSummary());
    })();
    getMyFields()
      .then((data) => {
        setUserFields(data.userFields || []);
        setFieldValues(data.values || {});
      })
      .catch(() => {});
  }, []);

  const handleSaveFields = async (e) => {
    e.preventDefault();
    if (fieldsSaving) return;
    setFieldsFeedback(null);
    if (missingRequired(userFields, fieldValues).length) {
      setFieldsFeedback({ type: 'error', message: 'Fill in all required fields.' });
      return;
    }
    setFieldsSaving(true);
    try {
      const data = await updateProfile({ customFields: pickValues(fieldValues, userFields.map((f) => f.id)) });
      setFieldValues(data.customFields || {});
      setFieldsFeedback({ type: 'success', message: 'Saved!' });
    } catch (err) {
      setFieldsFeedback({ type: 'error', message: err.message || 'Failed to update' });
    } finally {
      setFieldsSaving(false);
    }
  };

  const handleSaveUsername = async (e) => {
    e.preventDefault();
    if (usernameSubmitting) return;
    setUsernameFeedback(null);
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameFeedback({ type: 'error', message: 'Username is required' });
      return;
    }
    setUsernameSubmitting(true);
    try {
      await updateProfile({ username: trimmed });
      await refreshUser();
      setUsernameFeedback({ type: 'success', message: 'Saved!' });
    } catch (err) {
      setUsernameFeedback({ type: 'error', message: err.message || 'Failed to update' });
    } finally {
      setUsernameSubmitting(false);
    }
  };

  const handleSaveName = async (e) => {
    e.preventDefault();
    if (nameSubmitting) return;
    setNameFeedback(null);
    setNameSubmitting(true);
    const trimmed = name.trim();
    const prefs = { ...state.preferences, name: trimmed };

    try {
      await savePreferences(prefs);
      dispatch({ type: 'SET_PREFERENCES', preferences: prefs });
      syncInBackground('preferences');
      await updateProfile({ name: trimmed });
      await refreshUser();
      setNameFeedback({ type: 'success', message: 'Saved!' });
    } catch (err) {
      setNameFeedback({ type: 'error', message: err.message || 'Failed to update' });
    } finally {
      setNameSubmitting(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordSubmitting) return;
    setPasswordFeedback(null);
    if (!newPassword || newPassword.length < 8) {
      setPasswordFeedback({ type: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: 'error', message: 'Passwords do not match.' });
      return;
    }
    setPasswordSubmitting(true);
    try {
      await updateProfile({ password: newPassword });
      setNewPassword('');
      setConfirmPassword('');
      setPasswordFeedback({ type: 'success', message: 'Password changed!' });
    } catch (err) {
      setPasswordFeedback({ type: 'error', message: err.message || 'Failed to change password' });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <h1 className="text-xl font-semibold">User Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle><h2>Account</h2></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <span className="shrink-0 text-muted-foreground">Email</span>
            <span className="min-w-0 wrap-anywhere sm:text-right">{user?.email || ''}</span>
          </div>

          <Separator />

          <form className="space-y-3" onSubmit={handleSaveUsername}>
            <div className="space-y-1.5">
              <Label htmlFor="account-username">Username</Label>
              <Input id="account-username" type="text" value={username} disabled={usernameSubmitting} aria-describedby="username-feedback" onChange={(e) => { setUsername(e.target.value); setUsernameFeedback(null); }} />
            </div>
            <Button type="submit" disabled={usernameSubmitting} aria-label={usernameSubmitting ? 'Saving username' : 'Save username'}>{usernameSubmitting ? 'Saving...' : 'Save'}</Button>
            <SettingsFeedback id="username-feedback" feedback={usernameFeedback} />
          </form>

          <Separator />

          <form className="space-y-3" onSubmit={handleSaveName}>
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Name</Label>
              <Input id="account-name" type="text" value={name} disabled={nameSubmitting} aria-describedby="name-feedback" onChange={(e) => { setName(e.target.value); setNameFeedback(null); }} />
            </div>
            <Button type="submit" disabled={nameSubmitting} aria-label={nameSubmitting ? 'Saving name' : 'Save name'}>{nameSubmitting ? 'Saving...' : 'Save'}</Button>
            <SettingsFeedback id="name-feedback" feedback={nameFeedback} />
          </form>

          <Separator />

          <form className="space-y-3" onSubmit={handleChangePassword} aria-describedby="password-feedback">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New Password</Label>
              <PasswordField
                id="new-password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordFeedback(null); }}
                disabled={passwordSubmitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <PasswordField
                id="confirm-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordFeedback(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleChangePassword(e); } }}
                disabled={passwordSubmitting}
              />
            </div>
            <Button type="submit" disabled={passwordSubmitting}>
              {passwordSubmitting ? 'Changing...' : 'Change Password'}
            </Button>
            <SettingsFeedback id="password-feedback" feedback={passwordFeedback} />
          </form>
        </CardContent>
      </Card>

      {userFields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle><h2>Profile</h2></CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSaveFields} aria-describedby="fields-feedback" noValidate>
              {userFields.map((f) => (
                <CustomFieldInput
                  key={f.id}
                  field={f}
                  idPrefix="settings-field"
                  value={fieldValues[f.id]}
                  onChange={(v) => { setFieldValues((prev) => ({ ...prev, [f.id]: v })); setFieldsFeedback(null); }}
                  disabled={fieldsSaving}
                />
              ))}
              <Button type="submit" disabled={fieldsSaving}>
                {fieldsSaving ? 'Saving...' : 'Save'}
              </Button>
              <SettingsFeedback id="fields-feedback" feedback={fieldsFeedback} />
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle><h2 id="profile-heading">Learner Profile</h2></CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Updated automatically by the AI as you complete activities.</p>
          <div className="rounded-md bg-muted p-3 text-sm leading-relaxed" aria-labelledby="profile-heading">
            {profileSummary || <em className="text-muted-foreground">No profile yet. Complete an activity to build your profile.</em>}
          </div>
          <Button variant="outline" onClick={() => setFeedbackOpen(true)}>
            Add Feedback
          </Button>
        </CardContent>
      </Card>

      <ProfileFeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        onDone={async () => {
          setProfileSummary(await getLearnerProfileSummary());
        }}
      />
    </div>
  );
}

function SettingsFeedback({ id, feedback }) {
  const color = feedback?.type === 'error' ? 'text-destructive' : 'text-success-foreground';
  return (
    <p id={id} className={feedback ? `text-sm ${color}` : 'sr-only'} role="status" aria-live="polite" aria-atomic="true">
      {feedback?.message || ''}
    </p>
  );
}

function ProfileFeedbackDialog({ open, onOpenChange, onDone }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (submitting || !text.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const profile = await ensureProfileExists();
      const result = await orchestrator.updateProfileFromFeedback(profile, text.trim(), {
        lessonName: 'Settings', activityType: 'feedback', activityGoal: 'User-provided profile feedback',
      });
      if (result?.profile) {
        const merged = mergeProfile(profile, result.profile);
        await saveLearnerProfile(merged);
        if (result.summary) await saveLearnerProfileSummary(result.summary);
        syncInBackground('profile', 'profileSummary');
      }
      onOpenChange(false);
      setText('');
      if (onDone) onDone();
    } catch (e) {
      setError(e?.message || 'Could not update your profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Profile Feedback</DialogTitle>
          <DialogDescription>
            Share anything that seems inaccurate or missing -- your device, experience level, learning style, or anything else.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="profile-feedback-input" className="sr-only">Profile feedback</Label>
          <Textarea
            id="profile-feedback-input"
            rows={4}
            placeholder="e.g. I'm a complete beginner. I use a Chromebook and don't have admin access."
            value={text}
            disabled={submitting}
            aria-describedby="profile-feedback-error"
            onChange={(e) => { setText(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); } }}
          />
          <p id="profile-feedback-error" className={error ? 'text-sm text-destructive' : 'sr-only'} role="alert">
            {error}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !text.trim()}>
            {submitting ? 'Updating...' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
