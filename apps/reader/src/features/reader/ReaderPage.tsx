import { useParams } from 'react-router-dom'

export default function ReaderPage() {
    const { bookId } = useParams<{ bookId: string }>()
    return <div className="p-4">Reader: {bookId} (placeholder)</div>
}
