export function setupFeedback({api, onOpen, onClose, onPhraseSaved}) {
    const dialog = document.getElementById('feedback-dialog');
    const form = document.getElementById('feedback-form');
    const question = document.getElementById('feedback-question');
    const comment = document.getElementById('feedback-comment');
    const status = document.getElementById('feedback-status');
    const submit = document.getElementById('feedback-submit');
    const close = document.getElementById('feedback-close');
    let context;
    let key;
    let pending;
    let sending = false;
    let saved = false;

    function open(current, heardBefore) {
        const phrase = Boolean(heardBefore);
        const nextKey = JSON.stringify([current, phrase]);
        if (key !== nextKey || saved) {
            form.reset();
            key = nextKey;
            context = current;
            saved = false;
            pending = null;
            status.textContent = '';
            submit.textContent = 'Send feedback';
            submit.disabled = comment.disabled = false;
        }
        question.hidden = !phrase;
        question.disabled = !phrase || Boolean(pending);
        if (phrase && !pending) form.elements.heard.value = heardBefore;
        document.getElementById('comment-optional').hidden = !phrase;
        comment.required = !phrase;
        onOpen();
        dialog.showModal();
        if (pending) submit.focus();
        else if (phrase) question.querySelector('input:checked').focus();
        else comment.focus();
    }

    form.onsubmit = async event => {
        event.preventDefault();
        if (sending || saved) return;
        if (!pending) pending = {
            ...context, id: crypto.randomUUID(), comment: comment.value,
            heardBefore: question.hidden ? null : form.elements.heard.value
        };
        sending = true;
        submit.disabled = close.disabled = question.disabled = comment.disabled = true;
        submit.textContent = 'Sending…';
        status.textContent = '';
        try {
            const result = await api('feedback', pending);
            saved = true;
            if (result.heardBefore) onPhraseSaved(result.heardBefore);
            status.textContent = 'Thanks for your feedback.';
            submit.textContent = 'Sent';
        } catch (error) {
            if (error.status >= 400 && error.status < 500) {
                pending = null;
                comment.disabled = false;
                question.disabled = question.hidden;
                status.textContent = error.message;
            } else {
                // A lost response can follow a successful write. Resend the same receipt.
                status.textContent = 'Couldn’t confirm delivery. Check your connection and try again.';
            }
            submit.disabled = false;
            submit.textContent = 'Try again';
        } finally {
            sending = false;
            close.disabled = false;
            (saved ? close : submit).focus();
        }
    };
    close.onclick = () => dialog.close();
    dialog.addEventListener('cancel', event => { if (sending) event.preventDefault(); });
    dialog.addEventListener('close', () => onClose(saved && !question.hidden));
    return open;
}
