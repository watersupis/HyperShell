import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";

interface QuickConnectFormProps {
  onConnectSsh: (host: string, port: number, username: string, password: string) => void;
  onCancel: () => void;
}

export function QuickConnectForm({ onConnectSsh, onCancel }: QuickConnectFormProps) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = useCallback((event: React.FormEvent) => {
    event.preventDefault();
    if (host.trim()) onConnectSsh(host.trim(), Number.parseInt(port, 10) || 22, username, password);
  }, [host, port, username, password, onConnectSsh]);

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      onSubmit={handleSubmit}
      className="w-full max-w-sm flex flex-col items-center gap-5"
    >
      <div className="w-full flex flex-col gap-3">
        <Input
          type="text"
          placeholder="Hostname or IP address"
          value={host}
          onChange={(event) => setHost(event.target.value)}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the field the user opened to fill
          autoFocus
        />
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <Input type="text" placeholder="Port" value={port} onChange={(event) => setPort(event.target.value)} />
          <Input type="text" placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
        </div>
        <Input type="password" placeholder="Password (optional)" value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      <div className="flex items-center gap-3 w-full">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button type="submit" variant="primary" className="flex-1">Connect</Button>
      </div>
    </motion.form>
  );
}
