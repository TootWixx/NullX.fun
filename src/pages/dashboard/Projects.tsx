import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, FolderCode, Copy, Trash2, ToggleLeft, ToggleRight, Upload, Lock, KeyRound, Eye, EyeOff, AlertTriangle, FileCode, Save } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  generateRecoveryKey,
  createVerificationBlob,
  verifyRecoveryKey,
  encryptContent,
  decryptContent,
  isVaultCryptoAvailable,
} from '@/lib/encryption';
import { useVault } from '@/hooks/useVault';

interface Project {
  id: string;
  name: string;
  description: string | null;
  script_content: string | null;
  is_active: boolean;
  created_at: string;
  encryption_iv: string | null;
  encryption_salt: string | null;
}

interface EncryptionConfig {
  verification_blob: string;
  salt: string;
}

export default function Projects() {
  const { user, subscribed, isAdmin } = useAuth();
  const {
    encryptionConfig,
    setEncryptionConfig,
    unlocked,
    setUnlocked,
    sessionKey,
    setSessionKey,
    clearVault,
  } = useVault();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Encryption state
  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [recoveryKeyDisplay, setRecoveryKeyDisplay] = useState('');
  const [setupConfirmed, setSetupConfirmed] = useState(false);

  // Unlock state
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [recoveryKeyInput, setRecoveryKeyInput] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  // View source state
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingProject, setViewingProject] = useState<Project | null>(null);
  const [decryptedContent, setDecryptedContent] = useState('');
  const [showContent, setShowContent] = useState(false);

  // Edit source state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else setProjects((data as any[]) || []);
    setLoading(false);
  };

  const fetchEncryptionConfig = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('encryption_configs')
      .select('verification_blob, salt')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) setEncryptionConfig(data);
  };

  useEffect(() => {
    fetchProjects();
    fetchEncryptionConfig();
  }, [user]);

  useEffect(() => {
    if (!isVaultCryptoAvailable()) {
      toast({
        title: 'Vault needs a secure browser context',
        description:
          'Open this app at http://localhost:… on this PC (not http://192.168… or another LAN URL). Browsers only expose Web Crypto there or over HTTPS.',
        variant: 'destructive',
      });
    }
  }, []);

  useEffect(() => {
    if (!user) {
      clearVault();
      setEncryptionConfig(null);
    }
  }, [user, clearVault, setEncryptionConfig]);

  const handleSetupEncryption = async () => {
    const key = generateRecoveryKey();
    setRecoveryKeyDisplay(key);
    setSetupDialogOpen(true);
  };

  const confirmSetup = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { verificationBlob, salt } = await createVerificationBlob(recoveryKeyDisplay);
      const { error } = await supabase.from('encryption_configs').insert({
        user_id: user.id,
        verification_blob: verificationBlob,
        salt,
      });
      if (error) throw error;
      setEncryptionConfig({ verification_blob: verificationBlob, salt });
      setSessionKey(recoveryKeyDisplay);
      setUnlocked(true);
      setSetupDialogOpen(false);
      setSetupConfirmed(false);
      toast({ title: 'Encryption enabled', description: 'Your recovery key is now active' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!encryptionConfig) return;
    setUnlocking(true);
    const valid = await verifyRecoveryKey(recoveryKeyInput, encryptionConfig.verification_blob, encryptionConfig.salt);
    if (valid) {
      setSessionKey(recoveryKeyInput);
      setUnlocked(true);
      setUnlockDialogOpen(false);
      setRecoveryKeyInput('');
      toast({ title: 'Vault unlocked' });
    } else {
      toast({ title: 'Invalid key', description: 'The recovery key is incorrect', variant: 'destructive' });
    }
    setUnlocking(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith('.lua') && !f.name.endsWith('.txt')) {
      toast({ title: 'Invalid file', description: 'Only .lua and .txt files are accepted', variant: 'destructive' });
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setFileContent(ev.target?.result as string || '');
    reader.readAsText(f);
  };

  const handleCreate = async () => {
    if (!name.trim() || !user) return;
    const isStarter = !subscribed && !isAdmin;
    if (isStarter && projects.length >= 1) {
      toast({
        title: 'Starter plan limit reached',
        description: 'Starter includes 1 project slot. Open a Discord ticket to upgrade.',
        variant: 'destructive',
      });
      return;
    }
    if (!encryptionConfig || !unlocked) {
      toast({ title: 'Vault locked', description: 'Set up or unlock encryption first', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let encryptedScript: string | null = null;
      let iv: string | null = null;

      if (fileContent.trim()) {
        const encrypted = await encryptContent(fileContent, sessionKey, encryptionConfig.salt);
        encryptedScript = encrypted.ciphertext;
        iv = encrypted.iv;
      }

      const { error } = await supabase.from('projects').insert({
        name: name.trim(),
        description: description.trim() || null,
        script_content: encryptedScript,
        encryption_iv: iv,
        encryption_salt: encryptionConfig.salt,
        user_id: user.id,
      });
      if (error) throw error;
      toast({ title: 'Project created', description: 'Script encrypted and stored securely' });
      setDialogOpen(false);
      setName('');
      setDescription('');
      setFile(null);
      setFileContent('');
      fetchProjects();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleViewSource = async (project: Project) => {
    if (!project.script_content || !project.encryption_iv) {
      toast({ title: 'No script', description: 'This project has no uploaded script', variant: 'destructive' });
      return;
    }
    if (!unlocked || !sessionKey) {
      toast({ title: 'Vault locked', description: 'Unlock the vault first to view sources', variant: 'destructive' });
      return;
    }
    try {
      const content = await decryptContent(
        project.encryption_iv,
        project.script_content,
        sessionKey,
        project.encryption_salt || encryptionConfig!.salt
      );
      setDecryptedContent(content);
      setViewingProject(project);
      setShowContent(true);
      setViewDialogOpen(true);
    } catch {
      toast({ title: 'Decryption failed', description: 'Could not decrypt with current key', variant: 'destructive' });
    }
  };

  const handleEditSource = async (project: Project) => {
    if (!project.script_content || !project.encryption_iv) {
      toast({ title: 'No script', description: 'This project has no uploaded script to edit', variant: 'destructive' });
      return;
    }
    if (!unlocked || !sessionKey) {
      toast({ title: 'Vault locked', description: 'Unlock the vault first to edit sources', variant: 'destructive' });
      return;
    }
    try {
      const content = await decryptContent(
        project.encryption_iv,
        project.script_content,
        sessionKey,
        project.encryption_salt || encryptionConfig!.salt
      );
      setEditContent(content);
      setEditingProject(project);
      setEditDialogOpen(true);
    } catch {
      toast({ title: 'Decryption failed', description: 'Could not decrypt with current key', variant: 'destructive' });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingProject || !sessionKey || !encryptionConfig) return;
    
    setSavingEdit(true);
    try {
      // Re-encrypt the edited content
      const { iv, ciphertext } = await encryptContent(
        editContent,
        sessionKey,
        encryptionConfig.salt
      );

      const { error } = await supabase
        .from('projects')
        .update({
          script_content: ciphertext,
          encryption_iv: iv,
          encryption_salt: encryptionConfig.salt,
        })
        .eq('id', editingProject.id);

      if (error) throw error;
      
      toast({ title: 'Source updated', description: 'Your script has been saved. Re-obfuscate to update the protected version.' });
      setEditDialogOpen(false);
      setEditingProject(null);
      setEditContent('');
      fetchProjects();
    } catch (err: any) {
      toast({ title: 'Error saving', description: err.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleActive = async (project: Project) => {
    const { error } = await supabase.from('projects').update({ is_active: !project.is_active }).eq('id', project.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else fetchProjects();
  };

  const deleteProject = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Project deleted' }); fetchProjects(); }
  };

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast({ title: 'Copied', description: 'Project ID copied to clipboard' });
  };

  if (loading) return <div className="animate-pulse text-muted-foreground">Loading projects...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your protected Lua scripts</p>
        </div>
        <div className="flex items-center gap-2">
          {!encryptionConfig ? (
            <Button onClick={handleSetupEncryption} variant="outline" className="active:scale-[0.97] transition-transform">
              <KeyRound className="h-4 w-4" /> Setup Encryption
            </Button>
          ) : !unlocked ? (
            <Button onClick={() => setUnlockDialogOpen(true)} variant="outline" className="active:scale-[0.97] transition-transform">
              <Lock className="h-4 w-4" /> Unlock Vault
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-full">
              <Lock className="h-3 w-3" /> Vault Unlocked
            </span>
          )}
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={!encryptionConfig || !unlocked || (!subscribed && !isAdmin && projects.length >= 1)}
            className="active:scale-[0.97] transition-transform"
          >
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </div>
      </div>

      {!encryptionConfig && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Encryption not configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Set up a recovery key to encrypt your project files. You'll need this key each time you want to access your unobfuscated source code.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderCode className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No projects yet. Create one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id} className="relative overflow-hidden transition-shadow hover:shadow-md hover:shadow-primary/5">
              <div className={`absolute left-0 top-0 h-full w-1 ${project.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    {project.description && <CardDescription className="mt-1">{project.description}</CardDescription>}
                  </div>
                  <div className="flex items-center gap-2">
                    {project.script_content && unlocked && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                        <Lock className="h-2.5 w-2.5 inline mr-0.5" />Encrypted
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${project.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {project.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {unlocked ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{project.id}</code>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyId(project.id)}><Copy className="h-3 w-3" /></Button>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {project.script_content && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => handleViewSource(project)} className="text-xs">
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleEditSource(project)} className="text-xs">
                            <FileCode className="h-3.5 w-3.5 mr-1" /> Edit
                          </Button>
                        </>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(project)} className="text-xs">
                        {project.is_active ? <ToggleRight className="h-3.5 w-3.5 mr-1" /> : <ToggleLeft className="h-3.5 w-3.5 mr-1" />}
                        {project.is_active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteProject(project.id)} className="text-xs text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-5 text-center">
                    <Lock className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                    <p className="text-sm font-medium">Project locked</p>
                    <p className="mt-1 text-xs text-muted-foreground">Unlock the vault to reveal IDs, source actions, and protected file details.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New Project Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Create a new protected script project. Files are encrypted client-side.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input id="name" placeholder="My Script" value={name} onChange={(e) => setName(e.target.value)} className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description (optional)</Label>
              <Input id="desc" placeholder="A brief description" value={description} onChange={(e) => setDescription(e.target.value)} className="bg-background/50" />
            </div>
            <div className="space-y-2">
              <Label>Lua Script File</Label>
              <input ref={fileRef} type="file" accept=".lua,.txt" onChange={handleFileSelect} className="hidden" />
              <div
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 p-6 cursor-pointer transition-colors"
              >
                <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                {file ? (
                  <p className="text-sm font-medium">{file.name} <span className="text-muted-foreground">({fileContent.length} chars)</span></p>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to upload .lua or .txt</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving || !name.trim()}>
              {saving ? 'Encrypting...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recovery Key Setup Dialog */}
      <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" /> Recovery Key</DialogTitle>
            <DialogDescription>
              Save this key! You'll need it every time you want to access your unobfuscated source files. If you lose it, your encrypted files cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-4 text-center">
              <code className="text-lg font-mono font-bold text-primary tracking-widest">{recoveryKeyDisplay}</code>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs text-destructive">Write this down or save it securely. It cannot be recovered once this dialog is closed.</p>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={setupConfirmed} onChange={(e) => setSetupConfirmed(e.target.checked)} className="rounded" />
              I have saved my recovery key
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupDialogOpen(false)}>Cancel</Button>
            <Button onClick={confirmSetup} disabled={!setupConfirmed || saving}>
              {saving ? 'Setting up...' : 'Confirm & Enable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock Dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> Unlock Vault</DialogTitle>
            <DialogDescription>Enter your recovery key to access your encrypted project files.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Recovery Key</Label>
              <Input
                placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                value={recoveryKeyInput}
                onChange={(e) => setRecoveryKeyInput(e.target.value)}
                className="bg-background/50 font-mono text-center tracking-widest"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUnlock} disabled={unlocking || !recoveryKeyInput.trim()}>
              {unlocking ? 'Verifying...' : 'Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Source Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={(open) => { setViewDialogOpen(open); if (!open) { setDecryptedContent(''); setShowContent(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewingProject?.name} — Source</DialogTitle>
            <DialogDescription>Decrypted source code (client-side only)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setShowContent(!showContent)}>
                {showContent ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                {showContent ? 'Hide' : 'Show'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(decryptedContent); toast({ title: 'Copied' }); }}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
              </Button>
            </div>
            {showContent ? (
              <pre className="max-h-[400px] overflow-auto rounded-lg bg-muted p-4 font-mono text-xs whitespace-pre-wrap">{decryptedContent}</pre>
            ) : (
              <div className="rounded-lg bg-muted p-8 text-center text-muted-foreground text-sm">
                Content hidden — click Show to reveal
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Source Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => { 
        setEditDialogOpen(open); 
        if (!open) { 
          setEditingProject(null); 
          setEditContent(''); 
        } 
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              Edit {editingProject?.name}
            </DialogTitle>
            <DialogDescription>Edit your script source code. Save to update the encrypted store. You'll need to re-obfuscate to update the protected version.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-[400px] rounded-lg bg-muted p-4 font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
              spellCheck={false}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit} className="gap-1">
              {savingEdit ? 'Saving...' : <><Save className="h-4 w-4" /> Save Changes</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
