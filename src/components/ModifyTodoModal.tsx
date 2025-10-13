import { useState, useEffect, type FC } from "react";
import { createPortal } from "react-dom";

type ModifyTodoModalProps = {
  /** Whether the modal should be visible */
  isOpen: boolean;
  /** Called when the user cancels or clicks outside the modal */
  onClose: () => void;
  /** Called with the updated todo content when the user submits */
  onUpdate: (content: string) => void;
  /** The current content of the todo to edit */
  initialContent: string;
};

/**
 * A modal component for modifying an existing Todo.
 * It is rendered only when `isOpen` is true.
 */
const ModifyTodoModal: FC<ModifyTodoModalProps> = ({
  isOpen,
  onClose,
  onUpdate,
  initialContent,
}) => {
const [newContent, setNewContent] = useState(initialContent);
useEffect(() => {
  if (isOpen) {
    setNewContent(initialContent);
  }
}, [isOpen, initialContent]);

  // Reset input when the modal is opened/closed or when initialContent changes
  if (!isOpen) {
    if (newContent !== "") setNewContent("");
    return null;
  }

  const handleSubmit = () => {
    const trimmed = newContent.trim();
    if (trimmed === "") return;
    onUpdate(trimmed);
    setNewContent("");
    onClose();
  };

  const handleCancel = () => {
    setNewContent("");
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={handleCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Modify Todo</h3>
        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Todo content"
          className="modal-input"
        />
        <div className="modal-actions">
          <button onClick={handleSubmit}>Submit</button>
          <button onClick={handleCancel}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ModifyTodoModal;
