"use client";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { avatarPresets } from "../lib/avatar-presets";

export type Profile = { username: string; name: string; bio: string; avatar?: string };
export type ProfileInput = { username: string; name: string; bio: string; avatar?: string };

export function ProfileAvatar({ name, avatar }: { name: string; avatar?: string | null }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const preset = avatarPresets.find((option) => avatar === "preset:" + option.id);
  const image = preset
    ? "/avatars/" + preset.id + ".svg"
    : avatar?.startsWith("data:image/jpeg;base64,")
      ? avatar
      : null;
  if (image && image !== failedImage)
    return <img className="profile-avatar" src={image} alt="" onError={() => setFailedImage(image)} />;
  return (
    <span className="profile-avatar profile-initial" aria-hidden="true">
      {Array.from(name.trim())[0]?.toLocaleUpperCase("pt-BR") ?? "?"}
    </span>
  );
}

export function ProfileForm({
  profile,
  busy,
  onSave,
}: {
  profile?: Profile;
  busy: boolean;
  onSave: (input: ProfileInput) => void;
}) {
  const [avatar, setAvatar] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const preview = avatar ?? profile?.avatar;

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
        setError("Escolha uma imagem JPG, PNG ou WebP de até 5 MB.");
        return;
      }
      const image = await createImageBitmap(file);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        const context = canvas.getContext("2d");
        if (!context) throw new Error();
        const side = Math.min(image.width, image.height);
        context.fillStyle = "#1b202c";
        context.fillRect(0, 0, 256, 256);
        context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
        setAvatar(canvas.toDataURL("image/jpeg", 0.82));
      } finally {
        image.close();
      }
    } catch {
      setError("Não foi possível abrir essa imagem.");
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      name: String(form.get("name")),
      username: String(form.get("username")),
      bio: String(form.get("bio") ?? ""),
      ...(avatar !== undefined ? { avatar } : {}),
    });
  }

  return (
    <form className="form" onSubmit={submit}>
      <fieldset className="profile-picker">
        <legend>
          Ícone de perfil <span className="muted">(opcional)</span>
        </legend>
        <div className="avatar-options" role="group" aria-label="Ícones prontos">
          {avatarPresets.map((option) => (
            <button
              key={option.id}
              type="button"
              className="avatar-option"
              aria-label={option.label}
              title={option.label}
              aria-pressed={preview === "preset:" + option.id}
              disabled={loading || busy}
              onClick={() => {
                setAvatar("preset:" + option.id);
                setError("");
              }}
            >
              <img src={"/avatars/" + option.id + ".svg"} alt="" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <small className="avatar-credits">
          Ícones de Lorc e Delapouite ·{" "}
          <a href="/creditos" target="_blank" rel="noopener noreferrer">
            Game-icons.net · CC BY 3.0
          </a>
        </small>
        <div className="row profile-photo">
          <ProfileAvatar name={profile?.name ?? ""} avatar={preview} />
          <label>
            Enviar foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={selectImage}
              disabled={loading || busy}
              aria-describedby="profile-photo-help"
            />
            <small id="profile-photo-help">JPG, PNG ou WebP, até 5 MB.</small>
          </label>
          {preview && (
            <button type="button" onClick={() => setAvatar("")} disabled={loading || busy}>
              Remover
            </button>
          )}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      <label>
        Nome
        <input name="name" required maxLength={80} defaultValue={profile?.name} />
      </label>
      <label>
        Usuário
        <input
          name="username"
          required
          minLength={3}
          maxLength={32}
          defaultValue={profile?.username}
          aria-describedby="username-help"
        />
        <small id="username-help">De 3 a 32 caracteres. Pode usar espaços, acentos e símbolos.</small>
      </label>
      {profile && (
        <label>
          Bio
          <textarea name="bio" maxLength={300} defaultValue={profile.bio} />
        </label>
      )}
      <button className="primary" disabled={busy || loading}>
        Salvar perfil
      </button>
    </form>
  );
}
