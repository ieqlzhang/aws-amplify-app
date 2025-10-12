import { useState, type FC } from "react";
import { createPortal } from "react-dom";

type TodoModalProps = {
  /** Whether the modal should be visible */
  isOpen: boolean;
  /** Called when the user cancels or clicks outside the modal */
  onClose: () => void;
  /** Called with the new todo content when the user submits */
  onCreate: (content: string) => void;
};

/**
 * A simple modal component for creating a new Todo.
 * It is rendered only when `isOpen` is true.
 */
const TodoModal: FC<TodoModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [newContent, setNewContent] = useState("");

  // Reset input when the modal is opened/closed
  if (!isOpen) {
    // Ensure the input is cleared when the modal is hidden
    if (newContent !== "") setNewContent("");
    return null;
  }

  const handleSubmit = () => {
    const trimmed = newContent.trim();
    if (trimmed === "") return;
    onCreate(trimmed);
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
        <h3>New Todo</h3>
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

export default TodoModal;
