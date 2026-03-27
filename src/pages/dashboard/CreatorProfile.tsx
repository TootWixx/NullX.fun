import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { User, Image, Palette, Save, Eye, Upload, Loader2, X, MessageCircle } from 'lucide-react';

interface Profile {
  id?: string;
  username: string;
  avatar_url: string;
  background_url: string;
  background_color: string;
  bio: string;
  discord_server_link: string;
}

const DEFAULT_PROFILE: Profile = {
  username: '',
  avatar_url: '',
  background_url: '',
  background_color: '#0a0a1a',
  bio: '',
  discord_server_link: '',
};

async function uploadImage(file: File, userId: string, type: 'avatar' | 'background'): Promise<string | null> {
  const readDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(f);
    });

  try {
    const dataUrl = await readDataUrl(file);
    const { data, error } = await supabase.functions.invoke('upload-creator-media', {
      body: {
        type,
        dataUrlOrBase64: dataUrl,
        fileName: file.name,
        contentType: file.type,
        // userId is redundant (edge function derives from JWT) but kept for clarity
        userId,
      },
    });

    if (error) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      return null;
    }

    const url = (data as any)?.url as string | undefined;
    if (!url) {
      toast({ title: 'Upload failed', description: 'No URL returned', variant: 'destructive' });
      return null;
    }

    return `${url}?t=${Date.now()}`;
  } catch (e: any) {
    toast({ title: 'Upload failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    return null;
  }
}

function ImageField({
  label, hint, value, onChange, uploadType, userId,
}: {
  label: string; hint?: string; value: string;
  onChange: (url: string) => void;
  uploadType: 'avatar' | 'background';
  userId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5 MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const url = await uploadImage(file, userId, uploadType);
    if (url) { onChange(url); toast({ title: '✅ Image uploaded!' }); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          title="Upload from device"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </Button>
        {value && (
          <Button type="button" variant="outline" size="icon" className="shrink-0 text-destructive/70 hover:text-destructive" onClick={() => onChange('')}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      {value && uploadType === 'avatar' && (
        <img src={value} alt="preview" className="h-12 w-12 rounded-full object-cover border border-border mt-1" />
      )}
    </div>
  );
}

export default function CreatorProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('creator_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data as unknown as Profile);
        setLoading(false);
      });
  }, [user]);

  const set = (field: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setProfile((p) => ({ ...p, [field]: e.target.value }));

  const setField = (field: keyof Profile) => (val: string) =>
    setProfile((p) => ({ ...p, [field]: val }));

  const save = async () => {
    if (!user) return;
    if (!profile.username.trim()) {
      toast({ title: 'Username required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      ...profile,
      user_id: user.id,
      avatar_url: String(profile.avatar_url ?? '').trim() || null,
      background_url: String(profile.background_url ?? '').trim() || null,
      bio: String(profile.bio ?? '').trim() || null,
      discord_server_link: String(profile.discord_server_link ?? '').trim() || null,
    };
    const { error } = await supabase
      .from('creator_profiles')
      .upsert(payload as any, { onConflict: 'user_id' });

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Profile saved!' });
    }
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading profile…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <User className="h-7 w-7 text-primary" />
          Creator Profile
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          This profile appears on your public key page — like a guns.lol profile card.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Identity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Username <span className="text-destructive">*</span></Label>
                <Input value={profile.username} onChange={set('username')} placeholder="yourname" maxLength={30} />
                <p className="text-[11px] text-muted-foreground">Shown as the title on your key page</p>
              </div>
              <div className="space-y-1.5">
                <Label>Discord Server Link <span className="text-muted-foreground text-[11px]">(optional)</span></Label>
                <Input
                  value={profile.discord_server_link}
                  onChange={set('discord_server_link')}
                  placeholder="https://discord.gg/..."
                  type="url"
                />
                <p className="text-[11px] text-muted-foreground">Shown as a Join Discord button on your key page</p>
              </div>
              <div className="space-y-1.5">
                <Label>Bio</Label>
                <Textarea
                  value={profile.bio}
                  onChange={set('bio') as any}
                  placeholder="Complete the tasks below to get your key!"
                  rows={2}
                  maxLength={200}
                  className="resize-none"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Image className="h-4 w-4" /> Appearance
              </CardTitle>
              <CardDescription>
                Paste a URL <strong>or</strong> click <Upload className="inline h-3 w-3" /> to upload from your device (max 5 MB).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImageField
                label="Profile Picture"
                uploadType="avatar"
                userId={user!.id}
                value={profile.avatar_url}
                onChange={setField('avatar_url')}
              />
              <ImageField
                label="Background Image"
                hint="Leave empty to use the solid background color below."
                uploadType="background"
                userId={user!.id}
                value={profile.background_url}
                onChange={setField('background_url')}
              />
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2">
                  <Palette className="h-3.5 w-3.5" /> Background Color
                </Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={profile.background_color}
                    onChange={(e) => setProfile((p) => ({ ...p, background_color: e.target.value }))}
                    className="h-9 w-16 cursor-pointer rounded-md border border-input bg-transparent"
                  />
                  <Input
                    value={profile.background_color}
                    onChange={set('background_color')}
                    placeholder="#0a0a1a"
                    className="font-mono"
                    maxLength={7}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button onClick={save} disabled={saving} className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving…' : 'Save Profile'}
            </Button>
            <Button variant="outline" onClick={() => setShowPreview((v) => !v)}>
              <Eye className="h-4 w-4 mr-2" />
              {showPreview ? 'Hide' : 'Preview'}
            </Button>
          </div>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="rounded-xl overflow-hidden border border-border" style={{ height: 380 }}>
            <div
              className="relative h-32 w-full"
              style={{
                background: profile.background_url
                  ? `url(${profile.background_url}) center/cover`
                  : profile.background_color,
              }}
            >
              <div className="absolute inset-0 bg-black/40" />
            </div>
            <div className="bg-background px-6 pb-6 -mt-10 relative flex flex-col items-center text-center gap-2">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt="avatar"
                  className="h-20 w-20 rounded-full border-4 border-background object-cover shadow-lg"
                />
              ) : (
                <div className="h-20 w-20 rounded-full border-4 border-background bg-muted flex items-center justify-center shadow-lg">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div>
                <p className="font-bold text-lg">{profile.username || 'yourname'}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {profile.bio || 'Complete the tasks below to get your key!'}
                </p>
              </div>
              {profile.discord_server_link && (
                <a
                  href={profile.discord_server_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex"
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Join Discord
                  </Button>
                </a>
              )}
              <div className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary ring-1 ring-primary/20 mt-1">
                <img src="/nullx-logo.png" alt="NullX.fun" className="h-3 w-3 mr-0.5" />
                NullX.fun
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
