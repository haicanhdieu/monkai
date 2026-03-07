import { useParams } from 'react-router-dom'

export default function CategoryPage() {
    const { category } = useParams<{ category: string }>()
    return <div className="p-4">Category: {category} (placeholder)</div>
}
